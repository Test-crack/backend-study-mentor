// src/controllers/superadminVerificationController.ts
//
// Superadmin Question-Bank Verification panel — thin HTTP wrapper around the
// existing CLI verification/import libraries (Verification/, Import/), so
// admins can run the same two-layer pipeline from the web instead of a
// terminal. Deliberately forked per exam/bank-type the same way the CLI is
// (see CLAUDE.md) — only this dispatch layer is shared, never the pipeline
// logic itself.
//
// Scope: IELTS drills only for now (the plan's first fork). Add entries to
// FORKS as the pattern is proven for IA / diagnostic / spoken-english.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

import { verifyFile, fileFindingsFlat, verifyRun } from '../Verification/drills/question-banks/layer1-verifier/verify';
import { determineBucket } from '../Verification/drills/question-banks/layer1-verifier/checks';
import { writeRunReport } from '../Verification/drills/question-banks/shared/excelReport';
import { judgeRun } from '../Verification/drills/question-banks/layer2-content-judge/judge';
import type { JudgeStats } from '../Verification/drills/question-banks/layer2-content-judge/judge';
import { writeJudgeReport } from '../Verification/drills/question-banks/layer2-content-judge/report';
import { createGeminiClient, createLimiter, resolveApiKey } from '../Verification/drills/question-banks/shared/llm';
import { loadDrillCsv, toCsvText } from '../Verification/drills/question-banks/shared/csvLoader';
import { assignKeys, toTaggedRows, TAGGED_HEADER } from '../Verification/drills/question-banks/key-assignment-tool/assignKeys';
import { fetchBucketRows, indexFromDbRows } from '../Verification/drills/question-banks/key-assignment-tool/dbIndex';
import { timestamp as reportTimestamp } from '../Verification/drills/question-banks/shared/reportNaming';
import { planImport, countActions, type ExistingRow } from '../Import/importer';

import {
    verifyFile as verifyDiagnosticFile,
    fileFindingsFlat as diagnosticFileFindingsFlat,
    verifyRun as verifyDiagnosticRun,
} from '../Verification/diagnostic/question-banks/layer1-verifier/verify';
import { writeRunReport as writeDiagnosticRunReport } from '../Verification/diagnostic/question-banks/shared/excelReport';
import { judgeRun as judgeDiagnosticRun } from '../Verification/diagnostic/question-banks/layer2-content-judge/judge';
import type { JudgeStats as DiagnosticJudgeStats } from '../Verification/diagnostic/question-banks/layer2-content-judge/judge';
import { writeJudgeReport as writeDiagnosticJudgeReport } from '../Verification/diagnostic/question-banks/layer2-content-judge/report';
// Diagnostic's Layer 2 reuses drills' Gemini client helpers directly — there
// is no separate copy under diagnostic/question-banks/shared/ (confirmed
// against diagnostic's own layer2-content-judge/cli.ts).
import { loadDiagnosticCsv } from '../Verification/diagnostic/question-banks/shared/csvLoader';
import {
    validateBatch as validateDiagnosticBatch,
    diffRows as diffDiagnosticRows,
    ImportPlanError as DiagnosticImportPlanError,
    type ExistingDiagnosticRow,
    type DiagnosticRowUpdate,
} from '../Verification/diagnostic/importer/importer';
import {
    parseBackup as parseDiagnosticBackup,
    assertRestorable as assertDiagnosticRestorable,
    RestorePlanError,
} from '../Verification/diagnostic/importer/restorer';

import {
    verifyFile as verifyIAFile,
    fileFindingsFlat as iaFileFindingsFlat,
    verifyRun as verifyIARun,
} from '../Verification/ia/question-banks/layer1-verifier/verify';
import { determineBucket as determineIABucket } from '../Verification/ia/question-banks/layer1-verifier/checks';
import { writeRunReport as writeIARunReport } from '../Verification/ia/question-banks/shared/excelReport';
import { judgeRun as judgeIARun } from '../Verification/ia/question-banks/layer2-content-judge/judge';
import type { JudgeStats as IAJudgeStats } from '../Verification/ia/question-banks/layer2-content-judge/judge';
import { writeJudgeReport as writeIAJudgeReport } from '../Verification/ia/question-banks/layer2-content-judge/report';
// IA's csvLoader re-exports drills' toCsvText/findCsvFiles unchanged — only
// loadIACsv is new; reuse the toCsvText already imported for drills above.
import { loadIACsv } from '../Verification/ia/question-banks/shared/csvLoader';
import { assignKeys as assignIAKeys, toTaggedRows as toIATaggedRows, TAGGED_HEADER as IA_TAGGED_HEADER } from '../Verification/ia/question-banks/key-assignment-tool/assignKeys';
import { fetchBucketRows as fetchIABucketRows, indexFromDbRows as indexFromIADbRows } from '../Verification/ia/question-banks/key-assignment-tool/dbIndex';
import { planImport as planIAImport, countActions as countIAActions, type ExistingRow as IAExistingRow } from '../Verification/ia/question-banks/importer/importer';

const DIAGNOSTIC_BACKUP_DIR = path.resolve(__dirname, '..', 'Verification', 'diagnostic', 'results', 'set-backups');

/** Mirrors `ExistingRow` in ia/question-banks/importer/importer.ts. */
const IA_EXISTING_SELECT = {
    source_key: true,
    skill: true,
    sub_skill: true,
    difficulty: true,
    question_type: true,
    passage_id: true,
    passage_text: true,
    audio_url: true,
    prompt_text: true,
    options: true,
    correct_answer: true,
    explanation: true,
    exam_id: true,
} as const;

/** Same nullable-source_key hedge as toExistingRows below, for IA's ExistingRow shape. */
function toIAExistingRows(rows: Array<Omit<IAExistingRow, 'source_key'> & { source_key: string | null }>): IAExistingRow[] {
    return rows.filter((r): r is IAExistingRow => r.source_key !== null);
}

/** Explicit `select` — same schema-drift hedge as the CLI (see importer/cli.ts). */
const DIAGNOSTIC_EXISTING_SELECT = {
    id: true,
    set_id: true,
    sequence: true,
    skill: true,
    level: true,
    question_type: true,
    prompt_text: true,
    options: true,
    correct_answer: true,
    min_words: true,
    passage_text: true,
    audio_url: true,
    created_at: true,
} as const;

/**
 * Prisma types `source_key` as nullable (schema-wide), but every row here was
 * fetched by `source_key: { in: keys }` — it can never be null in this result set.
 */
function toExistingRows(rows: Array<Omit<ExistingRow, 'source_key'> & { source_key: string | null }>): ExistingRow[] {
    return rows.filter((r): r is ExistingRow => r.source_key !== null);
}
import { resolveTarget, TargetError, type TargetName } from '../Import/target';

// ─── Fork registry ─────────────────────────────────────────────────────────
// { examId, bankType } -> what to call. Only ielts/drill wired for now.

type ForkKey = `${string}:${string}`;

function forkKey(examId: string, bankType: string): ForkKey {
    return `${examId}:${bankType}`;
}

const SUPPORTED_FORKS = new Set<ForkKey>(['ielts:drill', 'ielts:diagnostic', 'ielts:ia']);

function assertSupportedFork(examId: string, bankType: string): void {
    if (!SUPPORTED_FORKS.has(forkKey(examId, bankType))) {
        throw new UnsupportedForkError(examId, bankType);
    }
}

class UnsupportedForkError extends Error {
    constructor(examId: string, bankType: string) {
        super(`No verification pipeline wired up yet for exam "${examId}" / bank type "${bankType}".`);
    }
}

// ─── DB target safety (adapted from Import/target.ts) ─────────────────────
// A running API instance only ever points at one database — there's no
// per-request dev/prod flag to guard, unlike the CLI's SSH-tunnel ambiguity.
//
// NODE_ENV is NOT a reliable signal for which database this is: this repo's
// own dev setup runs with NODE_ENV=production while pointed at
// testcrack_db_dev through the SSH tunnel (confirmed empirically — an
// earlier version of this check assumed NODE_ENV implied the target and
// would have wrongly refused every import on a correctly-configured dev
// box). So this only asserts the connection resolves to ONE of the two
// known TestCrack databases — a real name, not silence or a typo — and
// reports which one in the response, rather than trying to guess intent.

let cachedTargetCheck:
    | { ok: true; target: TargetName; databaseName: string }
    | { ok: false; message: string }
    | null = null;

async function verifyDatabaseTarget(): Promise<
    { ok: true; target: TargetName; databaseName: string } | { ok: false; message: string }
> {
    if (cachedTargetCheck) return cachedTargetCheck;

    let lastError: string = 'No connection string found (DATABASE_URL_DEV / DATABASE_URL_PROD / DATABASE_URL).';
    for (const target of ['dev', 'prod'] as TargetName[]) {
        try {
            const resolved = resolveTarget(target, process.env);
            cachedTargetCheck = { ok: true, target, databaseName: resolved.databaseName };
            return cachedTargetCheck;
        } catch (err) {
            lastError = err instanceof TargetError ? err.message : String(err);
        }
    }

    cachedTargetCheck = {
        ok: false,
        message: `The connected database is not a recognized TestCrack database. ${lastError}`,
    };
    return cachedTargetCheck;
}

// ─── Shared upload handling ─────────────────────────────────────────────────
// Layer 1/2 read from real files on disk (see CLAUDE.md — reuse, don't
// rewrite). Multer gives us buffers; write each to a temp file, run the
// library against that path, then clean up.

interface UploadedFile {
    originalname: string;
    buffer: Buffer;
}

/**
 * Content-addressed, not random: the Layer 2 cache (cache.ts's `cacheFileFor`)
 * derives its cache filename from a hash of the source file's absolute path,
 * not just its content. A fresh `mkdtemp` on every upload gave identical
 * batches a new path — and therefore a new, empty cache file — every single
 * time, silently defeating the cache and re-paying for every row on every
 * run. Deriving the path from the upload's own content hash instead means
 * the same batch reliably reuses the same path, and therefore the same
 * cache file, across requests.
 */
function writeTempFiles(files: UploadedFile[]): string[] {
    const base = path.join(os.tmpdir(), 'verify-upload');
    return files.map(f => {
        const hash = crypto.createHash('sha256').update(f.buffer).digest('hex').slice(0, 20);
        const dir = path.join(base, hash);
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, path.basename(f.originalname));
        fs.writeFileSync(filePath, f.buffer);
        return filePath;
    });
}

/**
 * Deliberately a no-op now — kept (rather than deleted at every call site) so
 * the intent stays visible in the diff.
 *
 * These paths are content-addressed (writeTempFiles), so deleting them after
 * one request is actively harmful: Layer 2 runs as a background job that can
 * still be reading a file minutes after its HTTP request returned, and any
 * other request over the same file content — say, downloading the Layer 1
 * report for the same batch — resolves to the exact same path. Its cleanup
 * would delete the file out from under the still-running Layer 2 job,
 * producing FILE_UNREADABLE on whatever hadn't been read yet. (Confirmed:
 * this is exactly what happened — file 1 finished before the race, files
 * 2-10 did not.) Leaving identical content in place is also precisely what
 * lets the Layer 2 judge cache actually hit across requests, so "don't
 * delete" is the fix, not a workaround.
 */
function cleanupTempFiles(_filePaths: string[]): void {}

/**
 * Multer/Busboy decodes multipart filenames as latin1 by default, regardless
 * of what the browser actually sent — a real UTF-8 filename (this batch's
 * "SPEAKING · PRONUNCIATION.csv" has a middle dot, U+00B7) comes back
 * mangled ("SPEAKING Â· PRONUNCIATION.csv"). Re-decoding latin1 bytes as
 * utf8 recovers the original string; it's a no-op for plain ASCII names.
 */
function fixMultipartFilename(name: string): string {
    return Buffer.from(name, 'latin1').toString('utf8');
}

function getUploadedFiles(req: AuthRequest): UploadedFile[] {
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return [];
    return files.map(f => ({ originalname: fixMultipartFilename(f.originalname), buffer: f.buffer }));
}

// ─── GET /api/superadmin/verification/coverage ─────────────────────────────
// "Exam content coverage" cards. IELTS drills only: counts live rows in
// drill_questions grouped by skill. Read-only DB query, not file-based —
// this is what's actually in the QA/prod bank, not a snapshot of a folder.

export async function getCoverage(_req: AuthRequest, res: Response) {
    try {
        const drillRows = await prisma.drillQuestion.groupBy({
            by: ['skill'],
            where: { exam_id: 'ielts' } as any,
            _count: { _all: true },
        });
        const diagnosticRows = await prisma.diagnosticQuestion.groupBy({
            by: ['skill'],
            where: { exam_id: 'ielts' } as any,
            _count: { _all: true },
        });
        const diagnosticSetCount = await prisma.diagnosticQuestion.groupBy({ by: ['set_id'] });
        const iaRows = await prisma.iAQuestion.groupBy({
            by: ['skill'],
            where: { exam_id: 'ielts' } as any,
            _count: { _all: true },
        });

        return res.json({
            data: [
                {
                    examId: 'ielts',
                    label: 'IELTS Preparation',
                    bankType: 'drill',
                    skills: drillRows.map(r => ({ skill: r.skill, count: r._count._all })),
                },
                {
                    examId: 'ielts',
                    label: 'IELTS Preparation',
                    bankType: 'diagnostic',
                    skills: diagnosticRows.map(r => ({ skill: r.skill, count: r._count._all })),
                    // Diagnostic content lives in fixed sets (import updates an
                    // existing set in place, never creates new ones) — the set
                    // count matters at least as much as the row count here.
                    setCount: diagnosticSetCount.length,
                },
                {
                    examId: 'ielts',
                    label: 'IELTS Preparation',
                    bankType: 'ia',
                    skills: iaRows.map(r => ({ skill: r.skill, count: r._count._all })),
                },
            ],
        });
    } catch (err: any) {
        console.error('[SuperAdminVerification] getCoverage error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch coverage' });
    }
}

// ─── POST /api/superadmin/verification/layer1 ──────────────────────────────
// Body (multipart): examId, bankType, expected? — files under field "files".
// Fast + free — runs synchronously, mirrors Import/cli.ts's inline gate.

export async function runLayer1(req: AuthRequest, res: Response) {
    const { examId, bankType } = req.body as { examId?: string; bankType?: string };
    if (!examId || !bankType) {
        return res.status(400).json({ error: 'examId and bankType are required.' });
    }

    try {
        assertSupportedFork(examId, bankType);
    } catch (err) {
        if (err instanceof UnsupportedForkError) return res.status(400).json({ error: err.message });
        throw err;
    }

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

    const expectedRowCount = Number(req.body.expected) > 0 ? Number(req.body.expected) : 200;
    const tempPaths = writeTempFiles(uploaded);

    try {
        const results =
            bankType === 'diagnostic'
                ? tempPaths.map((filePath, i) => {
                      // null = "use each file's own row count", since diagnostic
                      // batches legitimately vary in size (5-row sets, multi-set
                      // bundles) — there's no single fixed expected count like
                      // drills' 200-per-bucket.
                      const verdict = verifyDiagnosticFile(filePath, { expectedRowCount: null });
                      return {
                          fileName: uploaded[i].originalname,
                          outcome: verdict.outcome,
                          findings: diagnosticFileFindingsFlat(verdict).map(f => ({
                              code: f.code,
                              severity: f.severity,
                              message: f.message,
                              line: (f as any).line ?? null,
                          })),
                      };
                  })
                : bankType === 'ia'
                ? tempPaths.map((filePath, i) => {
                      const verdict = verifyIAFile(filePath, { expectedRowCount, requireSourceKey: false });
                      return {
                          fileName: uploaded[i].originalname,
                          outcome: verdict.outcome,
                          findings: iaFileFindingsFlat(verdict).map(f => ({
                              code: f.code,
                              severity: f.severity,
                              message: f.message,
                              line: (f as any).line ?? null,
                          })),
                      };
                  })
                : tempPaths.map((filePath, i) => {
                      const verdict = verifyFile(filePath, { expectedRowCount, requireSourceKey: false });
                      return {
                          fileName: uploaded[i].originalname,
                          outcome: verdict.outcome,
                          findings: fileFindingsFlat(verdict).map(f => ({
                              code: f.code,
                              severity: f.severity,
                              message: f.message,
                              line: (f as any).line ?? null,
                          })),
                      };
                  });

        return res.json({ data: results });
    } catch (err: any) {
        console.error('[SuperAdminVerification] runLayer1 error:', err);
        return res.status(500).json({ error: err.message ?? 'Layer 1 verification failed' });
    } finally {
        cleanupTempFiles(tempPaths);
    }
}

// ─── POST /api/superadmin/verification/layer1/report ───────────────────────
// The CLI's colored .xlsx — Summary sheet (pass/warn/fail counts, per-file
// answer-letter distribution) plus one sheet per file with every finding —
// not just the plain findings JSON runLayer1 returns. Re-verifies rather
// than trusting a prior result, same as everything else here.

export async function runLayer1Report(req: AuthRequest, res: Response) {
    const { examId, bankType } = req.body as { examId?: string; bankType?: string };
    if (!examId || !bankType) {
        return res.status(400).json({ error: 'examId and bankType are required.' });
    }

    try {
        assertSupportedFork(examId, bankType);
    } catch (err) {
        if (err instanceof UnsupportedForkError) return res.status(400).json({ error: err.message });
        throw err;
    }

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

    const expectedRowCount = Number(req.body.expected) > 0 ? Number(req.body.expected) : 200;
    const tempPaths = writeTempFiles(uploaded);
    const outPath = path.join(os.tmpdir(), `layer1-report-${crypto.randomUUID()}.xlsx`);

    try {
        if (bankType === 'diagnostic') {
            const run = verifyDiagnosticRun(tempPaths, null);
            await writeDiagnosticRunReport(run, outPath);
        } else if (bankType === 'ia') {
            const run = verifyIARun(tempPaths, { fallback: expectedRowCount, byDifficulty: {} }, { requireSourceKey: false });
            await writeIARunReport(run, outPath);
        } else {
            const run = verifyRun(tempPaths, { fallback: expectedRowCount, byLevel: {} }, { requireSourceKey: false });
            await writeRunReport(run, outPath);
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="layer1-verify-report.xlsx"`);
        return res.sendFile(outPath, err => {
            if (err) console.error('[SuperAdminVerification] runLayer1Report sendFile error:', err);
            fs.rm(outPath, { force: true }, () => {});
        });
    } catch (err: any) {
        console.error('[SuperAdminVerification] runLayer1Report error:', err);
        fs.rm(outPath, { force: true }, () => {});
        return res.status(500).json({ error: err.message ?? 'Layer 1 report failed' });
    } finally {
        cleanupTempFiles(tempPaths);
    }
}

// ─── Layer 2 job store ──────────────────────────────────────────────────────
// No job queue exists in this repo (see plan). In-memory map, single-process
// assumption — acceptable for a low-concurrency superadmin tool, not
// user-facing infra. Jobs are not persisted across a server restart.

type JudgeRunResultLike = Awaited<ReturnType<typeof runJudge>>;

interface Layer2Job {
    status: 'pending' | 'done' | 'error';
    startedAt: number;
    bankType: string;
    result?: JudgeRunResultLike;
    error?: string;
}

const layer2Jobs = new Map<string, Layer2Job>();

async function runJudge(filePaths: string[], bankType: string) {
    const resolved = resolveApiKey();
    if (resolved === null) {
        throw new Error('No API key configured for Layer 2 (set GEMINI_API_KEY).');
    }
    const client = createGeminiClient({ apiKey: resolved.key });

    if (bankType === 'diagnostic') {
        const stats: DiagnosticJudgeStats = { apiCalls: 0, cacheHits: 0 };
        // No audioDir/transcribeAudio: the Listening audio cross-check is
        // scoped out of this first pass (needs a whole-batch audio upload,
        // not just CSV) — it degrades gracefully to "skipped", never crashes.
        const run = await judgeDiagnosticRun(filePaths, {
            client,
            limit: createLimiter(4),
            useCache: true,
            stats,
        });
        return { files: run.files, apiCalls: stats.apiCalls, cacheHits: stats.cacheHits };
    }

    if (bankType === 'ia') {
        const stats: IAJudgeStats = { apiCalls: 0, cacheHits: 0 };
        // Same scoping as diagnostic above: no audioDir/transcribeAudio yet.
        const run = await judgeIARun(filePaths, {
            client,
            limit: createLimiter(4),
            useCache: true,
            stats,
        });
        return { files: run.files, apiCalls: stats.apiCalls, cacheHits: stats.cacheHits };
    }

    const stats: JudgeStats = { apiCalls: 0, cacheHits: 0 };
    const run = await judgeRun(filePaths, {
        client,
        votes: 1,
        limit: createLimiter(4),
        useCache: true,
        stats,
    });

    return { files: run.files, apiCalls: stats.apiCalls, cacheHits: stats.cacheHits };
}

// ─── POST /api/superadmin/verification/layer2 ──────────────────────────────
// Kicks off the LLM judge in the background, returns a jobId to poll.

export async function startLayer2(req: AuthRequest, res: Response) {
    const { examId, bankType } = req.body as { examId?: string; bankType?: string };
    if (!examId || !bankType) {
        return res.status(400).json({ error: 'examId and bankType are required.' });
    }

    try {
        assertSupportedFork(examId, bankType);
    } catch (err) {
        if (err instanceof UnsupportedForkError) return res.status(400).json({ error: err.message });
        throw err;
    }

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

    const tempPaths = writeTempFiles(uploaded);
    const jobId = crypto.randomUUID();
    layer2Jobs.set(jobId, { status: 'pending', startedAt: Date.now(), bankType });

    runJudge(tempPaths, bankType)
        .then(result => {
            layer2Jobs.set(jobId, { status: 'done', startedAt: Date.now(), bankType, result });
        })
        .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            layer2Jobs.set(jobId, { status: 'error', startedAt: Date.now(), bankType, error: message });
        })
        .finally(() => cleanupTempFiles(tempPaths));

    return res.status(202).json({ data: { jobId } });
}

// ─── GET /api/superadmin/verification/layer2/:jobId ────────────────────────

export async function getLayer2Status(req: AuthRequest, res: Response) {
    const jobId = String(req.params.jobId ?? '');
    const job = layer2Jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Unknown job id.' });

    return res.json({
        data: {
            status: job.status,
            startedAt: job.startedAt,
            result: job.result ?? null,
            error: job.error ?? null,
        },
    });
}

// ─── GET /api/superadmin/verification/layer2/:jobId/report ─────────────────
// The CLI's colored .xlsx for a completed judge run — green/amber/red/grey
// per row, blind-solve + adjudicator reasoning, same report writeJudgeReport
// produces for `npm run drills:judge`. Built from the job already held in
// memory — no re-upload, and critically no re-judging (Layer 2 costs API
// calls, so this must never trigger a fresh judge run).

export async function getLayer2Report(req: AuthRequest, res: Response) {
    const jobId = String(req.params.jobId ?? '');
    const job = layer2Jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Unknown job id.' });
    if (job.status !== 'done' || !job.result) {
        return res.status(400).json({ error: `Job is ${job.status}, not done — no report to build yet.` });
    }

    const outPath = path.join(os.tmpdir(), `layer2-report-${crypto.randomUUID()}.xlsx`);
    try {
        if (job.bankType === 'diagnostic') {
            await writeDiagnosticJudgeReport(job.result as any, outPath);
        } else if (job.bankType === 'ia') {
            await writeIAJudgeReport(job.result as any, outPath);
        } else {
            await writeJudgeReport(job.result as any, outPath);
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="layer2-judge-report.xlsx"`);
        return res.sendFile(outPath, err => {
            if (err) console.error('[SuperAdminVerification] getLayer2Report sendFile error:', err);
            fs.rm(outPath, { force: true }, () => {});
        });
    } catch (err: any) {
        console.error('[SuperAdminVerification] getLayer2Report error:', err);
        fs.rm(outPath, { force: true }, () => {});
        return res.status(500).json({ error: err.message ?? 'Layer 2 report failed' });
    }
}

// ─── POST /api/superadmin/verification/import/plan ─────────────────────────
// Dry run only — never writes. Mirrors Import/cli.ts's non-confirm report.

async function buildImportPlan(filePaths: string[], expectedRowCount: number) {
    const perFile: Array<{
        fileName: string;
        gateBlocked: string | null;
        toInsert: number;
        toUpdate: number;
        unchanged: number;
        errors: string[];
        updates: { source_key: string; changed: string[] }[];
    }> = [];

    for (const filePath of filePaths) {
        const verdict = verifyFile(filePath, { expectedRowCount, requireSourceKey: true });
        if (verdict.outcome === 'fail') {
            const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
            perFile.push({
                fileName: path.basename(filePath),
                gateBlocked: `Layer 1 FAILED: ${codes.join(', ')}.`,
                toInsert: 0,
                toUpdate: 0,
                unchanged: 0,
                errors: [],
                updates: [],
            });
            continue;
        }

        const loaded = loadDrillCsv(filePath);
        const keys = loaded.rows.map(r => r.source_key?.trim()).filter((k): k is string => Boolean(k));
        const existingRows: ExistingRow[] =
            keys.length === 0
                ? []
                : toExistingRows(
                      await prisma.drillQuestion.findMany({
                          where: { source_key: { in: keys } },
                          select: {
                              source_key: true,
                              skill: true,
                              sub_skill: true,
                              level: true,
                              drill_type: true,
                              prompt_text: true,
                              options: true,
                              correct_answer: true,
                              explanation: true,
                          },
                      }),
                  );
        const existingByKey = new Map(existingRows.map(r => [r.source_key, r]));
        const plan = planImport(loaded.rows, existingByKey);
        const counts = countActions(plan.plans);

        perFile.push({
            fileName: loaded.fileName,
            gateBlocked: null,
            toInsert: counts.insert,
            toUpdate: counts.update,
            unchanged: counts.unchanged,
            errors: plan.errors,
            updates: plan.plans
                .filter(p => p.action === 'update')
                .map(p => ({ source_key: p.row.source_key, changed: p.changed })),
        });
    }

    return perFile;
}

async function buildIAImportPlan(filePaths: string[], expectedRowCount: number) {
    const perFile: Array<{
        fileName: string;
        gateBlocked: string | null;
        toInsert: number;
        toUpdate: number;
        unchanged: number;
        errors: string[];
        updates: { source_key: string; changed: string[] }[];
    }> = [];

    for (const filePath of filePaths) {
        const verdict = verifyIAFile(filePath, { expectedRowCount, requireSourceKey: true });
        if (verdict.outcome === 'fail') {
            const codes = [...new Set(iaFileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
            perFile.push({
                fileName: path.basename(filePath),
                gateBlocked: `Layer 1 FAILED: ${codes.join(', ')}.`,
                toInsert: 0,
                toUpdate: 0,
                unchanged: 0,
                errors: [],
                updates: [],
            });
            continue;
        }

        const loaded = loadIACsv(filePath);
        const keys = loaded.rows.map(r => r.source_key?.trim()).filter((k): k is string => Boolean(k));
        const existingRows: IAExistingRow[] =
            keys.length === 0
                ? []
                : toIAExistingRows(
                      await prisma.iAQuestion.findMany({
                          where: { source_key: { in: keys } },
                          select: IA_EXISTING_SELECT,
                      }),
                  );
        const existingByKey = new Map(existingRows.map(r => [r.source_key, r]));
        const plan = planIAImport(loaded.rows, existingByKey);
        const counts = countIAActions(plan.plans);

        perFile.push({
            fileName: loaded.fileName,
            gateBlocked: null,
            toInsert: counts.insert,
            toUpdate: counts.update,
            unchanged: counts.unchanged,
            errors: plan.errors,
            updates: plan.plans
                .filter(p => p.action === 'update')
                .map(p => ({ source_key: p.row.source_key, changed: p.changed })),
        });
    }

    return perFile;
}

export async function planImportEndpoint(req: AuthRequest, res: Response) {
    const { examId, bankType, expected } = req.body as { examId?: string; bankType?: string; expected?: string };
    if (!examId || !bankType) {
        return res.status(400).json({ error: 'examId and bankType are required.' });
    }

    try {
        assertSupportedFork(examId, bankType);
    } catch (err) {
        if (err instanceof UnsupportedForkError) return res.status(400).json({ error: err.message });
        throw err;
    }

    if (bankType === 'diagnostic') return planDiagnosticImport(req, res);

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

    const expectedRowCount = Number(expected) > 0 ? Number(expected) : 200;
    const tempPaths = writeTempFiles(uploaded);
    try {
        const perFile = bankType === 'ia' ? await buildIAImportPlan(tempPaths, expectedRowCount) : await buildImportPlan(tempPaths, expectedRowCount);
        return res.json({ data: perFile });
    } catch (err: any) {
        console.error('[SuperAdminVerification] planImportEndpoint error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to plan import' });
    } finally {
        cleanupTempFiles(tempPaths);
    }
}

// ─── POST /api/superadmin/verification/import/confirm ──────────────────────
// The only write path. Requires layer2Reviewed: true (Layer 2 can't be
// cheaply re-run) and re-runs the Layer 1 gate inline before writing —
// mirrors Import/cli.ts:238-293.

export async function confirmImportEndpoint(req: AuthRequest, res: Response) {
    const { examId, bankType, layer2Reviewed: layer2ReviewedRaw, expected } = req.body as {
        examId?: string;
        bankType?: string;
        // Multipart form fields (multer) arrive as strings, not booleans — a JSON
        // body could send a real boolean, so both shapes must be accepted here.
        layer2Reviewed?: boolean | string;
        expected?: string;
    };
    if (!examId || !bankType) {
        return res.status(400).json({ error: 'examId and bankType are required.' });
    }

    try {
        assertSupportedFork(examId, bankType);
    } catch (err) {
        if (err instanceof UnsupportedForkError) return res.status(400).json({ error: err.message });
        throw err;
    }

    const layer2Reviewed = layer2ReviewedRaw === true || layer2ReviewedRaw === 'true';
    if (!layer2Reviewed) {
        return res.status(400).json({
            error:
                'Refusing to write without layer2Reviewed=true. Layer 2 checks whether the answers ' +
                'are correct and cannot be cheaply re-run here — review the Layer 2 report for these ' +
                'files first, then assert that you did.',
        });
    }

    const targetCheck = await verifyDatabaseTarget();
    if (!targetCheck.ok) {
        return res.status(500).json({ error: `Refusing to write — database target check failed: ${targetCheck.message}` });
    }

    if (bankType === 'diagnostic') return confirmDiagnosticImport(req, res);

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

    const expectedRowCount = Number(expected) > 0 ? Number(expected) : 200;
    const tempPaths = writeTempFiles(uploaded);
    try {
        const reports: Array<{
            fileName: string;
            gateBlocked: string | null;
            inserted: number;
            updated: number;
            unchanged: number;
            failed: number;
            errors: string[];
        }> = [];

        if (bankType === 'ia') {
            for (const filePath of tempPaths) {
                const verdict = verifyIAFile(filePath, { expectedRowCount, requireSourceKey: true });
                if (verdict.outcome === 'fail') {
                    const codes = [...new Set(iaFileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
                    reports.push({
                        fileName: path.basename(filePath),
                        gateBlocked: `Layer 1 FAILED: ${codes.join(', ')}.`,
                        inserted: 0,
                        updated: 0,
                        unchanged: 0,
                        failed: 0,
                        errors: [],
                    });
                    continue;
                }

                const loaded = loadIACsv(filePath);
                const keys = loaded.rows.map(r => r.source_key?.trim()).filter((k): k is string => Boolean(k));
                const existingRows: IAExistingRow[] =
                    keys.length === 0
                        ? []
                        : toIAExistingRows(
                              await prisma.iAQuestion.findMany({
                                  where: { source_key: { in: keys } },
                                  select: IA_EXISTING_SELECT,
                              }),
                          );
                const existingByKey = new Map(existingRows.map(r => [r.source_key, r]));
                const plan = planIAImport(loaded.rows, existingByKey);

                const written = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
                const errors = [...plan.errors];

                for (const p of plan.plans) {
                    if (p.action === 'unchanged') {
                        written.unchanged += 1;
                        continue;
                    }
                    const { line: _line, ...data } = p.row;
                    try {
                        await prisma.iAQuestion.upsert({
                            where: { source_key: p.row.source_key },
                            create: { ...data, is_active: true } as any,
                            update: {
                                prompt_text: data.prompt_text,
                                options: data.options,
                                correct_answer: data.correct_answer,
                                explanation: data.explanation,
                                passage_id: data.passage_id,
                                passage_text: data.passage_text,
                                audio_url: data.audio_url,
                                question_type: data.question_type,
                                exam_id: data.exam_id,
                                skill: data.skill,
                                sub_skill: data.sub_skill,
                                difficulty: data.difficulty,
                            } as any,
                        });
                        if (p.action === 'insert') written.inserted += 1;
                        else written.updated += 1;
                    } catch (err) {
                        written.failed += 1;
                        errors.push(
                            `line ${p.row.line} (${p.row.source_key}): write failed — ` +
                                (err instanceof Error ? err.message.split('\n')[0] : String(err)),
                        );
                    }
                }

                reports.push({
                    fileName: loaded.fileName,
                    gateBlocked: null,
                    ...written,
                    errors,
                });
            }

            return res.json({ data: reports });
        }

        for (const filePath of tempPaths) {
            const verdict = verifyFile(filePath, { expectedRowCount, requireSourceKey: true });
            if (verdict.outcome === 'fail') {
                const codes = [...new Set(fileFindingsFlat(verdict).filter(f => f.severity === 'fail').map(f => f.code))];
                reports.push({
                    fileName: path.basename(filePath),
                    gateBlocked: `Layer 1 FAILED: ${codes.join(', ')}.`,
                    inserted: 0,
                    updated: 0,
                    unchanged: 0,
                    failed: 0,
                    errors: [],
                });
                continue;
            }

            const loaded = loadDrillCsv(filePath);
            const keys = loaded.rows.map(r => r.source_key?.trim()).filter((k): k is string => Boolean(k));
            const existingRows: ExistingRow[] =
                keys.length === 0
                    ? []
                    : toExistingRows(
                          await prisma.drillQuestion.findMany({
                              where: { source_key: { in: keys } },
                              select: {
                                  source_key: true,
                                  skill: true,
                                  sub_skill: true,
                                  level: true,
                                  drill_type: true,
                                  prompt_text: true,
                                  options: true,
                                  correct_answer: true,
                                  explanation: true,
                              },
                          }),
                      );
            const existingByKey = new Map(existingRows.map(r => [r.source_key, r]));
            const plan = planImport(loaded.rows, existingByKey);

            const written = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
            const errors = [...plan.errors];

            for (const p of plan.plans) {
                if (p.action === 'unchanged') {
                    written.unchanged += 1;
                    continue;
                }
                const { line: _line, ...data } = p.row;
                try {
                    await prisma.drillQuestion.upsert({
                        where: { source_key: p.row.source_key },
                        // is_active only on create: never resurrect a deliberately retired question.
                        create: { ...data, is_active: true } as any,
                        update: {
                            prompt_text: data.prompt_text,
                            options: data.options,
                            correct_answer: data.correct_answer,
                            explanation: data.explanation,
                            drill_type: data.drill_type,
                            skill: data.skill,
                            sub_skill: data.sub_skill,
                            level: data.level,
                            updated_at: new Date(),
                        } as any,
                    });
                    if (p.action === 'insert') written.inserted += 1;
                    else written.updated += 1;
                } catch (err) {
                    written.failed += 1;
                    errors.push(
                        `line ${p.row.line} (${p.row.source_key}): write failed — ` +
                            (err instanceof Error ? err.message.split('\n')[0] : String(err)),
                    );
                }
            }

            reports.push({
                fileName: loaded.fileName,
                gateBlocked: null,
                ...written,
                errors,
            });
        }

        return res.json({ data: reports });
    } catch (err: any) {
        console.error('[SuperAdminVerification] confirmImportEndpoint error:', err);
        return res.status(500).json({ error: err.message ?? 'Import failed' });
    } finally {
        cleanupTempFiles(tempPaths);
    }
}

// ─── Diagnostic import: plan / confirm ──────────────────────────────────────
// Genuinely different shape from drills — see the plan doc. This is an
// UPDATE of an EXISTING set_id's rows (matched 1:1 by sequence), never an
// insert, and there is no source_key/Layer-1-gate concept in the CLI's own
// importer/cli.ts — it only checks the staging CSV parses cleanly
// (loadDiagnosticCsv().fatal), not the full structural Layer 1 checks. This
// mirrors that exactly rather than importing drills' stricter gate pattern.

interface DiagnosticImportRequestBody {
    setId?: string;
    sourceSetId?: string;
    audioUrlPrefix?: string;
}

async function loadDiagnosticBatchForImport(
    req: AuthRequest,
): Promise<
    | { ok: true; filePath: string; fileName: string; setId: string; sourceSetId?: string; audioUrlPrefix: string }
    | { ok: false; status: number; error: string }
> {
    const { setId, sourceSetId, audioUrlPrefix } = req.body as DiagnosticImportRequestBody;
    if (!setId) return { ok: false, status: 400, error: 'setId is required for a diagnostic import (the EXISTING set_id to update in place).' };

    const uploaded = getUploadedFiles(req);
    if (uploaded.length !== 1) {
        return { ok: false, status: 400, error: 'Diagnostic import takes exactly one staging CSV per request (field "files").' };
    }

    const [tempPath] = writeTempFiles(uploaded);
    return {
        ok: true,
        filePath: tempPath,
        fileName: uploaded[0].originalname,
        setId,
        sourceSetId: sourceSetId?.trim() || undefined,
        audioUrlPrefix: audioUrlPrefix?.trim() || '/diagnostics/audio/',
    };
}

async function planDiagnosticImport(req: AuthRequest, res: Response) {
    const loaded = await loadDiagnosticBatchForImport(req);
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.error });

    try {
        const parsed = loadDiagnosticCsv(loaded.filePath);
        if (parsed.fatal) {
            return res.json({
                data: {
                    fileName: loaded.fileName,
                    setId: loaded.setId,
                    gateBlocked: `Staging CSV could not be read cleanly (${parsed.findings.map(f => f.code).join(', ')}). Run Layer 1 verify on it first.`,
                    updates: [],
                },
            });
        }

        const existing: ExistingDiagnosticRow[] = (await prisma.diagnosticQuestion.findMany({
            where: { set_id: loaded.setId },
            orderBy: { sequence: 'asc' },
            select: DIAGNOSTIC_EXISTING_SELECT,
        })) as any;

        const updates = validateDiagnosticBatch(parsed.rows, existing, {
            setId: loaded.setId,
            sourceSetId: loaded.sourceSetId,
            fileLabel: loaded.fileName,
        });
        const diffed = diffDiagnosticRows(existing, updates, {
            audioUrlPrefix: loaded.audioUrlPrefix,
            importedAt: new Date(),
        });

        return res.json({
            data: {
                fileName: loaded.fileName,
                setId: loaded.setId,
                gateBlocked: null,
                updates: diffed.map(u => ({
                    sequence: u.sequence,
                    before: u.before,
                    after: { ...u.after, created_at: u.after.created_at.toISOString() },
                })),
            },
        });
    } catch (err: any) {
        if (err instanceof DiagnosticImportPlanError) {
            return res.json({
                data: { fileName: loaded.fileName, setId: loaded.setId, gateBlocked: err.message, updates: [] },
            });
        }
        console.error('[SuperAdminVerification] planDiagnosticImport error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to plan diagnostic import' });
    } finally {
        cleanupTempFiles([loaded.filePath]);
    }
}

async function confirmDiagnosticImport(req: AuthRequest, res: Response) {
    const loaded = await loadDiagnosticBatchForImport(req);
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.error });

    try {
        const parsed = loadDiagnosticCsv(loaded.filePath);
        if (parsed.fatal) {
            return res.status(400).json({
                error: `Staging CSV could not be read cleanly (${parsed.findings.map(f => f.code).join(', ')}). Run Layer 1 verify on it first.`,
            });
        }

        const existing: ExistingDiagnosticRow[] = (await prisma.diagnosticQuestion.findMany({
            where: { set_id: loaded.setId },
            orderBy: { sequence: 'asc' },
            select: DIAGNOSTIC_EXISTING_SELECT,
        })) as any;

        const importedAt = new Date();
        const stagedRows = validateDiagnosticBatch(parsed.rows, existing, {
            setId: loaded.setId,
            sourceSetId: loaded.sourceSetId,
            fileLabel: loaded.fileName,
        });
        const updates = diffDiagnosticRows(existing, stagedRows, { audioUrlPrefix: loaded.audioUrlPrefix, importedAt });

        // Same rollback story as the CLI: back up the pre-update rows before
        // writing — an update-in-place has no other undo path once committed.
        fs.mkdirSync(DIAGNOSTIC_BACKUP_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(DIAGNOSTIC_BACKUP_DIR, `${loaded.setId}--${stamp}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2), 'utf8');

        await prisma.$transaction(
            updates.map(u => prisma.diagnosticQuestion.update({ where: { id: u.id }, data: u.after as any, select: { id: true } })),
        );

        return res.json({
            data: {
                fileName: loaded.fileName,
                setId: loaded.setId,
                updated: updates.length,
                backupFile: path.basename(backupPath),
            },
        });
    } catch (err: any) {
        if (err instanceof DiagnosticImportPlanError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[SuperAdminVerification] confirmDiagnosticImport error:', err);
        return res.status(500).json({ error: err.message ?? 'Diagnostic import failed' });
    } finally {
        cleanupTempFiles([loaded.filePath]);
    }
}

// ─── Diagnostic restore: list backups / restore one ─────────────────────────

/** Prevents a `backupFile` request body from escaping DIAGNOSTIC_BACKUP_DIR. */
function safeBackupPath(backupFile: string): string {
    return path.join(DIAGNOSTIC_BACKUP_DIR, path.basename(backupFile));
}

export async function getDiagnosticImportBackups(req: AuthRequest, res: Response) {
    const setId = String(req.query.setId ?? '').trim();
    if (!setId) return res.status(400).json({ error: 'setId query param is required.' });

    try {
        if (!fs.existsSync(DIAGNOSTIC_BACKUP_DIR)) return res.json({ data: [] });

        const files = fs
            .readdirSync(DIAGNOSTIC_BACKUP_DIR)
            .filter(f => f.startsWith(`${setId}--`) && f.endsWith('.json'));

        const data = files.map(f => {
            const full = path.join(DIAGNOSTIC_BACKUP_DIR, f);
            const stat = fs.statSync(full);
            let rowCount = 0;
            try {
                const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
                rowCount = Array.isArray(parsed) ? parsed.length : 0;
            } catch {
                // corrupt backup file — still list it, just with rowCount 0
            }
            return { fileName: f, modifiedAt: stat.mtime.toISOString(), rowCount };
        });
        data.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

        return res.json({ data });
    } catch (err: any) {
        console.error('[SuperAdminVerification] getDiagnosticImportBackups error:', err);
        return res.status(500).json({ error: err.message ?? 'Failed to list backups' });
    }
}

export async function restoreDiagnosticImport(req: AuthRequest, res: Response) {
    const { backupFile, confirm: confirmRaw } = req.body as { backupFile?: string; confirm?: boolean | string };
    if (!backupFile) return res.status(400).json({ error: 'backupFile is required.' });
    const confirm = confirmRaw === true || confirmRaw === 'true';

    try {
        const fullPath = safeBackupPath(backupFile);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: `Backup file not found: ${path.basename(fullPath)}` });
        }

        const plan = parseDiagnosticBackup(fs.readFileSync(fullPath, 'utf8'), path.basename(fullPath));

        const liveRows = await prisma.diagnosticQuestion.findMany({
            where: { set_id: plan.setId },
            select: { id: true },
        });
        assertDiagnosticRestorable(plan, new Set(liveRows.map(r => r.id)));

        if (!confirm) {
            return res.json({
                data: { setId: plan.setId, rowCount: plan.rows.length, wouldRestore: true, written: false },
            });
        }

        const targetCheck = await verifyDatabaseTarget();
        if (!targetCheck.ok) {
            return res.status(500).json({ error: `Refusing to write — database target check failed: ${targetCheck.message}` });
        }

        await prisma.$transaction(
            plan.rows.map(r =>
                prisma.diagnosticQuestion.update({
                    where: { id: r.id },
                    data: {
                        question_type: r.question_type,
                        prompt_text: r.prompt_text,
                        options: r.options as any,
                        correct_answer: r.correct_answer,
                        min_words: r.min_words,
                        passage_text: r.passage_text,
                        audio_url: r.audio_url,
                        created_at: new Date(r.created_at),
                    },
                    select: { id: true },
                }),
            ),
        );

        return res.json({ data: { setId: plan.setId, rowCount: plan.rows.length, wouldRestore: false, written: true } });
    } catch (err: any) {
        if (err instanceof RestorePlanError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[SuperAdminVerification] restoreDiagnosticImport error:', err);
        return res.status(500).json({ error: err.message ?? 'Restore failed' });
    }
}

// ─── POST /api/superadmin/verification/tag ──────────────────────────────────
// Mirrors the CLI's key-assignment-tool: stamps a permanent source_key onto
// each row (reusing a key already issued in the DB for that exact prompt
// text, or allocating the next free number) and returns the tagged CSV as a
// download — the same "output CSV" the CLI writes to
// Verification/drills/results/key-assignment-tool/. One file per request;
// the database (not a local tagged-output folder) is the source of truth
// for already-issued keys, since a web request has no local cache to merge.

export async function tagBatch(req: AuthRequest, res: Response) {
    const { examId, bankType, expected } = req.body as { examId?: string; bankType?: string; expected?: string };
    if (!examId || !bankType) {
        return res.status(400).json({ error: 'examId and bankType are required.' });
    }
    const expectedRowCount = Number(expected) > 0 ? Number(expected) : 200;

    try {
        assertSupportedFork(examId, bankType);
    } catch (err) {
        if (err instanceof UnsupportedForkError) return res.status(400).json({ error: err.message });
        throw err;
    }

    if (bankType === 'diagnostic') {
        return res.status(400).json({ error: 'Diagnostic content has no source_key/tagging step — nothing to tag.' });
    }

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

    const tempPaths = writeTempFiles(uploaded);
    try {
        if (bankType === 'ia') {
            const taggedRows: string[][] = [];
            const blockedFiles: string[] = [];
            let skippedRowCount = 0;
            let droppedKeyCount = 0;
            let singleFileBucket: { skill: string; sub_skill: string; difficulty: string } | null = null;

            for (let i = 0; i < tempPaths.length; i += 1) {
                const filePath = tempPaths[i];
                const verdict = verifyIAFile(filePath, { expectedRowCount, requireSourceKey: false });
                if (verdict.outcome === 'fail') {
                    blockedFiles.push(uploaded[i].originalname);
                    continue;
                }

                const loaded = loadIACsv(filePath);
                const { bucket } = determineIABucket(loaded.rows);
                if (!bucket) {
                    blockedFiles.push(uploaded[i].originalname);
                    continue;
                }
                if (tempPaths.length === 1) singleFileBucket = bucket;

                const dbRows = await fetchIABucketRows(prisma as any, bucket);
                const { index } = indexFromIADbRows(dbRows, bucket);
                const { assignments, dropped, skippedRows } = assignIAKeys(loaded.rows, bucket, index);

                taggedRows.push(...toIATaggedRows(assignments));
                skippedRowCount += skippedRows.length;
                droppedKeyCount += dropped.length;
            }

            if (taggedRows.length === 0) {
                return res.status(400).json({
                    error: `All ${blockedFiles.length} file(s) failed Layer 1 or have no determinable bucket — nothing to tag.`,
                    blockedFiles,
                });
            }

            const csv = toCsvText(IA_TAGGED_HEADER, taggedRows);
            const descriptor = singleFileBucket
                ? `${singleFileBucket.skill}-${singleFileBucket.sub_skill}-${singleFileBucket.difficulty}`.toLowerCase()
                : 'all';
            const outName = `${descriptor}--${reportTimestamp()}.tagged.csv`;

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
            res.setHeader('X-Tag-Skipped-Rows', String(skippedRowCount));
            res.setHeader('X-Tag-Dropped-Keys', String(droppedKeyCount));
            res.setHeader('X-Tag-Blocked-Files', String(blockedFiles.length));
            return res.send(csv);
        }

        const taggedRows: string[][] = [];
        const blockedFiles: string[] = [];
        let skippedRowCount = 0;
        let droppedKeyCount = 0;
        let singleFileBucket: { skill: string; sub_skill: string; level: string } | null = null;

        for (let i = 0; i < tempPaths.length; i += 1) {
            const filePath = tempPaths[i];
            const verdict = verifyFile(filePath, { expectedRowCount, requireSourceKey: false });
            if (verdict.outcome === 'fail') {
                blockedFiles.push(uploaded[i].originalname);
                continue;
            }

            const loaded = loadDrillCsv(filePath);
            const { bucket } = determineBucket(loaded.rows);
            if (!bucket) {
                blockedFiles.push(uploaded[i].originalname);
                continue;
            }
            if (tempPaths.length === 1) singleFileBucket = bucket;

            const dbRows = await fetchBucketRows(prisma as any, bucket);
            const { index } = indexFromDbRows(dbRows, bucket);
            const { assignments, dropped, skippedRows } = assignKeys(loaded.rows, bucket, index);

            taggedRows.push(...toTaggedRows(assignments));
            skippedRowCount += skippedRows.length;
            droppedKeyCount += dropped.length;
        }

        if (taggedRows.length === 0) {
            return res.status(400).json({
                error: `All ${blockedFiles.length} file(s) failed Layer 1 or have no determinable bucket — nothing to tag.`,
                blockedFiles,
            });
        }

        const csv = toCsvText(TAGGED_HEADER, taggedRows);
        // Deliberately NOT reusing descriptorForFile (report naming): that
        // helper omits the level on purpose, because CLI reports live inside a
        // level-named folder that already says it. This CSV is a flat, standalone
        // download with no folder context — Layer 1's checkBucketAgainstFilename
        // requires the level word IN the filename, so it has to be included here
        // or a re-uploaded single-bucket tagged CSV fails its own filename check.
        const descriptor = singleFileBucket
            ? `${singleFileBucket.skill}-${singleFileBucket.sub_skill}-${singleFileBucket.level}`.toLowerCase()
            : 'all';
        const outName = `${descriptor}--${reportTimestamp()}.tagged.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        res.setHeader('X-Tag-Skipped-Rows', String(skippedRowCount));
        res.setHeader('X-Tag-Dropped-Keys', String(droppedKeyCount));
        res.setHeader('X-Tag-Blocked-Files', String(blockedFiles.length));
        return res.send(csv);
    } catch (err: any) {
        console.error('[SuperAdminVerification] tagBatch error:', err);
        return res.status(500).json({ error: err.message ?? 'Tagging failed' });
    } finally {
        cleanupTempFiles(tempPaths);
    }
}
