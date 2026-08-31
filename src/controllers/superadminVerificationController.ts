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

const SUPPORTED_FORKS = new Set<ForkKey>(['ielts:drill']);

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
        const rows = await prisma.drillQuestion.groupBy({
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
                    skills: rows.map(r => ({ skill: r.skill, count: r._count._all })),
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
        const results = tempPaths.map((filePath, i) => {
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
        const run = verifyRun(tempPaths, { fallback: expectedRowCount, byLevel: {} }, { requireSourceKey: false });
        await writeRunReport(run, outPath);

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
    result?: JudgeRunResultLike;
    error?: string;
}

const layer2Jobs = new Map<string, Layer2Job>();

async function runJudge(filePaths: string[]) {
    const resolved = resolveApiKey();
    if (resolved === null) {
        throw new Error('No API key configured for Layer 2 (set GEMINI_API_KEY).');
    }
    const client = createGeminiClient({ apiKey: resolved.key });
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
    layer2Jobs.set(jobId, { status: 'pending', startedAt: Date.now() });

    runJudge(tempPaths)
        .then(result => {
            layer2Jobs.set(jobId, { status: 'done', startedAt: Date.now(), result });
        })
        .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            layer2Jobs.set(jobId, { status: 'error', startedAt: Date.now(), error: message });
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
        await writeJudgeReport(job.result as any, outPath);
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

async function buildImportPlan(filePaths: string[]) {
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
        const verdict = verifyFile(filePath, { expectedRowCount: 200, requireSourceKey: true });
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

export async function planImportEndpoint(req: AuthRequest, res: Response) {
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
    try {
        const perFile = await buildImportPlan(tempPaths);
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
    const { examId, bankType, layer2Reviewed: layer2ReviewedRaw } = req.body as {
        examId?: string;
        bankType?: string;
        // Multipart form fields (multer) arrive as strings, not booleans — a JSON
        // body could send a real boolean, so both shapes must be accepted here.
        layer2Reviewed?: boolean | string;
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

    const uploaded = getUploadedFiles(req);
    if (uploaded.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (field "files").' });
    }

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

        for (const filePath of tempPaths) {
            const verdict = verifyFile(filePath, { expectedRowCount: 200, requireSourceKey: true });
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

// ─── POST /api/superadmin/verification/tag ──────────────────────────────────
// Mirrors the CLI's key-assignment-tool: stamps a permanent source_key onto
// each row (reusing a key already issued in the DB for that exact prompt
// text, or allocating the next free number) and returns the tagged CSV as a
// download — the same "output CSV" the CLI writes to
// Verification/drills/results/key-assignment-tool/. One file per request;
// the database (not a local tagged-output folder) is the source of truth
// for already-issued keys, since a web request has no local cache to merge.

export async function tagBatch(req: AuthRequest, res: Response) {
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
    try {
        const taggedRows: string[][] = [];
        const blockedFiles: string[] = [];
        let skippedRowCount = 0;
        let droppedKeyCount = 0;
        let singleFileBucket: { skill: string; sub_skill: string; level: string } | null = null;

        for (let i = 0; i < tempPaths.length; i += 1) {
            const filePath = tempPaths[i];
            const verdict = verifyFile(filePath, { expectedRowCount: 200, requireSourceKey: false });
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
