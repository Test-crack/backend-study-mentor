/**
 * The loadout engine's own endpoints.
 *
 * Separate from superadminVerificationController, which fans out to the five
 * hand-written forks. Keeping them apart means this path can't disturb the live
 * one, and retiring a fork later is a deletion.
 *
 * Two kinds of loadout: the four reference ones are pinned by the parity suite
 * and are read-only here; anything created in the panel is the admin's to edit.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

import { loadLoadoutFromFile } from '../Verification/loadout-engine/loadout/load';
import { LoadoutError, validateLoadout, type Loadout } from '../Verification/loadout-engine/loadout/schema';
import {
    DRAFT_MARKER,
    DraftError,
    expandDraft,
    type LoadoutDraft,
} from '../Verification/loadout-engine/loadout/draft';
import { verifyRun } from '../Verification/loadout-engine/engine/verify';
import { knownHooks } from '../Verification/loadout-engine/engine/hooks';
import { writeRunReport } from '../Verification/loadout-engine/engine/excelReport';

const LOADOUT_DIR = path.join(__dirname, '..', 'Verification', 'loadout-engine', 'loadout');

/**
 * Admin-authored loadouts, kept apart from the read-only reference ones.
 *
 * Outside `src/` because they are runtime data: writing them under a watched
 * source tree restarts the dev server mid-request.
 */
const CUSTOM_DIR = path.join(__dirname, '..', '..', 'data', 'loadouts');

function customPath(id: string): string {
    return path.join(CUSTOM_DIR, `${id}.json`);
}

function isCustom(id: string): boolean {
    return fs.existsSync(customPath(id));
}

interface UploadedFile {
    originalname: string;
    buffer: Buffer;
}

/**
 * Multer decodes multipart filenames as latin1, mangling real UTF-8 names.
 * Filenames matter — some checks compare them against what the rows claim.
 */
function decodeName(name: string): string {
    return Buffer.from(name, 'latin1').toString('utf8');
}

/** Content-addressed so the same upload reuses the same path across requests. */
function writeTempFiles(files: UploadedFile[]): string[] {
    const base = path.join(os.tmpdir(), 'loadout-upload');
    return files.map(f => {
        const hash = crypto.createHash('sha256').update(f.buffer).digest('hex').slice(0, 20);
        const dir = path.join(base, hash);
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, path.basename(decodeName(f.originalname)));
        fs.writeFileSync(filePath, f.buffer);
        return filePath;
    });
}

function idsIn(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter(n => n.endsWith('.json'))
        .map(n => n.replace(/\.json$/, ''))
        .sort();
}

function assertValidId(id: string): void {
    // Reject anything that isn't a plain id, so a crafted value can't walk out
    // of the loadout directory.
    if (!/^[a-z0-9-]+$/i.test(id)) throw new LoadoutError(`"${id}" is not a valid loadout id.`);
}

function readLoadout(id: string): Loadout {
    assertValidId(id);
    const file = isCustom(id) ? customPath(id) : path.join(LOADOUT_DIR, `${id}.json`);
    return loadLoadoutFromFile(file);
}

/** The draft an admin authored, when this loadout came from the panel. */
function readDraft(id: string): LoadoutDraft | null {
    assertValidId(id);
    if (!isCustom(id)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(customPath(id), 'utf8'));
        return (parsed?.[DRAFT_MARKER] && parsed.__draftSource) || null;
    } catch {
        return null;
    }
}

/** A compact description of what a loadout checks, for the panel's schema view. */
function summarize(loadout: Loadout) {
    return {
        id: loadout.id,
        label: loadout.label,
        columns: loadout.columns.map(c => ({
            name: c.name,
            kind: c.variants ? 'varies by row' : c.kind,
            required: c.kind === 'text' ? c.requireNonEmpty === true : undefined,
            members: c.members,
            appliesWhen: c.appliesWhen,
            forbiddenWhen: c.forbiddenWhen,
            variants: c.variants?.map(v => ({ when: v.when, kind: v.kind, allowed: v.allowed })),
        })),
        bucket: loadout.bucket?.dimensions ?? null,
        sourceKey: loadout.sourceKey
            ? `${loadout.sourceKey.prefix}_${loadout.sourceKey.segments.map(s => `{${s}}`).join('_')}_{${'#'.repeat(loadout.sourceKey.pad)}}`
            : null,
        conditionalColumns: (loadout.conditionalColumns ?? []).map(c => ({
            column: c.column,
            byColumn: c.byColumn,
            allowed: c.allowed,
        })),
        rowAllowList: loadout.rowAllowList ?? null,
        hooks: loadout.hooks ?? [],
        checkOrder: loadout.checkOrder,
        expectedRows: loadout.expectedRows,
    };
}

/** GET /api/superadmin/loadouts */
export async function listLoadouts(_req: AuthRequest, res: Response) {
    try {
        const ids = [...idsIn(LOADOUT_DIR), ...idsIn(CUSTOM_DIR)];
        const loadouts = ids.map(id => {
            try {
                const loadout = readLoadout(id);
                return {
                    id,
                    label: loadout.label,
                    columnCount: loadout.columns.length,
                    hasBucket: loadout.bucket !== undefined,
                    hasSourceKey: loadout.sourceKey !== undefined,
                    hookCount: (loadout.hooks ?? []).length,
                    // Only panel-authored loadouts are editable.
                    editable: isCustom(id),
                    valid: true as const,
                };
            } catch (err) {
                // Listed rather than hidden — a loadout that vanishes is harder to debug.
                return {
                    id,
                    label: id,
                    valid: false as const,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        });

        return res.json({ loadouts, knownHooks: knownHooks() });
    } catch (err: any) {
        return res.status(500).json({ error: 'list_failed', message: err?.message ?? 'Could not list loadouts.' });
    }
}

/** GET /api/superadmin/loadouts/:id */
export async function getLoadout(req: AuthRequest, res: Response) {
    try {
        const id = String(req.params.id);
        const loadout = readLoadout(id);
        return res.json({
            summary: summarize(loadout),
            raw: loadout,
            editable: isCustom(id),
            // What the builder reopens, rather than reversing the expanded form.
            draft: readDraft(id),
        });
    } catch (err: any) {
        const status = err instanceof LoadoutError ? 400 : 500;
        return res.status(status).json({ error: 'loadout_invalid', message: err?.message ?? 'Could not read loadout.' });
    }
}

/**
 * POST create / PUT update. Validates the expanded result before writing, so a
 * loadout that cannot run is never saved.
 */
export async function saveLoadout(req: AuthRequest, res: Response) {
    const draft = req.body?.draft as LoadoutDraft | undefined;
    const isUpdate = typeof req.params.id === 'string' && req.params.id.length > 0;
    const targetId = isUpdate ? String(req.params.id) : String(draft?.id ?? '');

    if (!draft) return res.status(400).json({ error: 'no_draft', message: 'Nothing to save.' });

    try {
        assertValidId(targetId);

        // Reference loadouts are pinned by the parity suite.
        const reference = idsIn(LOADOUT_DIR);
        if (reference.includes(targetId)) {
            return res.status(409).json({
                error: 'reserved_id',
                message: `"${targetId}" is a built-in loadout and can't be edited here. Duplicate it under a new name instead.`,
            });
        }
        if (!isUpdate && isCustom(targetId)) {
            return res.status(409).json({ error: 'already_exists', message: `A loadout called "${targetId}" already exists.` });
        }
        if (isUpdate && !isCustom(targetId)) {
            return res.status(404).json({ error: 'not_found', message: `No editable loadout called "${targetId}".` });
        }

        const expanded = expandDraft({ ...draft, id: targetId });
        // Catches a gap in the expander that draft rules alone would miss.
        validateLoadout(expanded);

        fs.mkdirSync(CUSTOM_DIR, { recursive: true });
        fs.writeFileSync(
            customPath(targetId),
            JSON.stringify({ ...expanded, __draftSource: { ...draft, id: targetId } }, null, 2),
            'utf8',
        );

        return res.json({ id: targetId, summary: summarize(expanded) });
    } catch (err: any) {
        const known = err instanceof DraftError || err instanceof LoadoutError;
        return res
            .status(known ? 400 : 500)
            .json({ error: 'draft_invalid', message: err?.message ?? 'Could not save this loadout.' });
    }
}

/** DELETE /api/superadmin/loadouts/:id */
export async function deleteLoadout(req: AuthRequest, res: Response) {
    try {
        const id = String(req.params.id);
        assertValidId(id);
        if (!isCustom(id)) {
            return res.status(404).json({ error: 'not_found', message: 'Only loadouts created here can be deleted.' });
        }
        fs.unlinkSync(customPath(id));
        return res.json({ deleted: id });
    } catch (err: any) {
        return res.status(500).json({ error: 'delete_failed', message: err?.message ?? 'Could not delete.' });
    }
}

/**
 * POST /verify/report — the same run as /verify, returned as a colour-coded
 * .xlsx. Produced whether the batch passed or failed.
 */
export async function verifyReport(req: AuthRequest, res: Response) {
    const files = (req as any).files as UploadedFile[] | undefined;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'no_files', message: 'Attach at least one CSV.' });
    }

    let loadout: Loadout;
    try {
        loadout = readLoadout(String(req.body?.loadoutId ?? ''));
    } catch (err: any) {
        return res.status(400).json({ error: 'loadout_invalid', message: err?.message ?? 'Unknown loadout.' });
    }

    const parsed = Number(req.body?.expected);
    const fallback = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : loadout.expectedRows.fallback;
    const outPath = path.join(os.tmpdir(), `loadout-report-${crypto.randomUUID()}.xlsx`);

    try {
        const run = verifyRun(writeTempFiles(files), loadout, { fallback, byMember: {} });
        await writeRunReport(run, loadout, outPath);

        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        res.download(outPath, `layer1-${loadout.id}-${run.outcome}-${stamp}.xlsx`, () => {
            fs.unlink(outPath, () => {});
        });
    } catch (err: any) {
        fs.unlink(outPath, () => {});
        return res.status(500).json({ error: 'report_failed', message: err?.message ?? 'Could not build the report.' });
    }
}

/** POST /preview — validate without saving, so the builder can flag errors live. */
export async function previewDraft(req: AuthRequest, res: Response) {
    const draft = req.body?.draft as LoadoutDraft | undefined;
    if (!draft) return res.status(400).json({ error: 'no_draft', message: 'Nothing to preview.' });

    try {
        const expanded = expandDraft({ ...draft, id: draft.id || 'preview' });
        validateLoadout(expanded);
        return res.json({ ok: true, summary: summarize(expanded) });
    } catch (err: any) {
        return res.json({ ok: false, message: err?.message ?? 'This loadout is not valid yet.' });
    }
}

/** POST /verify — Layer 1 only. Writes nothing to the database. */
export async function verifyWithLoadout(req: AuthRequest, res: Response) {
    const files = (req as any).files as UploadedFile[] | undefined;
    const loadoutId = String(req.body?.loadoutId ?? '');
    const expectedRaw = req.body?.expected;
    const requireSourceKey = String(req.body?.requireSourceKey ?? '') === 'true';

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'no_files', message: 'Attach at least one CSV.' });
    }

    let loadout: Loadout;
    try {
        loadout = readLoadout(loadoutId);
    } catch (err: any) {
        return res.status(400).json({ error: 'loadout_invalid', message: err?.message ?? 'Unknown loadout.' });
    }

    const parsedExpected = Number(expectedRaw);
    const fallback =
        Number.isFinite(parsedExpected) && parsedExpected > 0
            ? Math.floor(parsedExpected)
            : loadout.expectedRows.fallback;

    try {
        const filePaths = writeTempFiles(files);
        const run = verifyRun(filePaths, loadout, { fallback, byMember: {} }, { requireSourceKey });

        return res.json({
            loadout: { id: loadout.id, label: loadout.label },
            expected: fallback,
            outcome: run.outcome,
            runFindings: run.runFindings,
            files: run.files.map(f => ({
                fileName: f.fileName,
                outcome: f.outcome,
                expectedRowCount: f.expectedRowCount,
                rowCount: f.rowResults.length,
                bucket: f.bucket,
                fileFindings: f.fileFindings,
                rowFindings: f.rowResults.flatMap(r => r.findings),
            })),
        });
    } catch (err: any) {
        return res
            .status(500)
            .json({ error: 'verify_failed', message: err?.message ?? 'Verification failed.' });
    }
}
