// Exam Engine — config loader (B1).
// Boot sequence: read the JSON seed → validate (throw on error = fail startup)
// → cache in memory → best-effort seed into the exam_configs table.
//
// The JSON file is the reviewable seed; the in-memory cache is the read path for
// the engine; the exam_configs table is the versioned record that provenance
// (engine_version + config_version on every result) refers back to.

import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { EngineConfig, ExamConfigEntry } from './types';
import { validateConfig } from './validator';

let CONFIG: EngineConfig | null = null;                 // pure FILE config (built-ins) — the source of truth for shipped exams
let AUTHORED: Record<string, ExamConfigEntry> = {};     // published DB-authored exams (Exam.source='authored')
let MERGED: EngineConfig | null = null;                 // what the engine actually serves: built-ins + authored

/**
 * Recompute the served view. File built-ins WIN on any id collision, so a DB row can never
 * shadow a shipped exam (IELTS/SE/OET are locked by construction). Scales stay the built-in
 * library — authored exams reuse it (referencing an unknown scale fails config verification).
 */
function rebuildMerged(): void {
  if (!CONFIG) { MERGED = null; return; }
  const exams: Record<string, ExamConfigEntry> = { ...CONFIG.exams };
  for (const [id, entry] of Object.entries(AUTHORED)) {
    if (!exams[id]) exams[id] = entry;   // never override a built-in
  }
  MERGED = { ...CONFIG, exams };
}

export function configFilePath(): string {
  return path.join(__dirname, 'exam-engine-config.v2.json');
}

export function readConfigFile(): EngineConfig {
  return JSON.parse(fs.readFileSync(configFilePath(), 'utf8')) as EngineConfig;
}

/**
 * Load + validate + cache + seed. Throws on validation errors so the caller can
 * fail startup — a server that boots with an invalid exam config is worse than
 * one that refuses to boot.
 */
export async function loadExamEngine(): Promise<void> {
  const cfg = readConfigFile();

  const { errors, warnings } = validateConfig(cfg);
  warnings.forEach((w) => console.warn(`[exam-engine] ⚠️  ${w}`));
  if (errors.length) {
    throw new Error(
      `[exam-engine] config invalid — ${errors.length} error(s):\n` +
        errors.map((e) => `  • ${e}`).join('\n')
    );
  }

  CONFIG = cfg;
  rebuildMerged();   // built-ins available immediately, even if the DB is unreachable

  // Seeding + authored-exam load need the DB; a blip must not take down the server, but an
  // invalid FILE config (above) must. So: fatal validation, best-effort DB.
  try {
    await seedExamConfigs(cfg);
  } catch (err: any) {
    console.warn(`[exam-engine] ⚠️  could not seed exam_configs (engine still runs from cache): ${err?.message ?? err}`);
  }
  await reloadAuthoredExams();   // merge published DB-authored exams on top of the built-ins

  console.log(
    `[exam-engine] loaded config v${cfg.config_version} (engine v${cfg.engine_version}) — ` +
      `${Object.keys(cfg.exams).length} exams, ${warnings.length} warning(s)`
  );
}

/** Upsert the Exam registry row + record this config version per exam (idempotent). */
async function seedExamConfigs(cfg: EngineConfig): Promise<void> {
  for (const [examId, exam] of Object.entries(cfg.exams)) {
    await prisma.exam.upsert({
      where: { id: examId },
      update: { label: exam?.naming?.public_display_name ?? examId, status: String(exam?.status ?? 'reserved'), source: 'file' },
      create: { id: examId, label: exam?.naming?.public_display_name ?? examId, status: String(exam?.status ?? 'reserved'), source: 'file' },
    });

    const existing = await prisma.examConfig.findUnique({
      where: { exam_id_config_version: { exam_id: examId, config_version: cfg.config_version } },
    });
    if (!existing) {
      await prisma.examConfig.create({
        data: { exam_id: examId, config_version: cfg.config_version, config: exam as any, is_active: true },
      });
    }
  }
}

/**
 * Load published DB-authored exams (source='authored', not draft, with an active config)
 * and merge them on top of the file built-ins. Best-effort: on any DB error the built-ins
 * still serve. Call at boot and after any publish/unpublish so the served view stays current.
 */
export async function reloadAuthoredExams(): Promise<void> {
  try {
    const rows = await prisma.examConfig.findMany({
      where: { is_active: true, exams: { source: 'authored', status: { in: ['live', 'reserved'] } } },
    });
    const next: Record<string, ExamConfigEntry> = {};
    for (const r of rows) next[r.exam_id] = r.config as unknown as ExamConfigEntry;
    AUTHORED = next;
    rebuildMerged();
    console.log(`[exam-engine] authored exams merged: ${Object.keys(AUTHORED).length}`);
  } catch (err: any) {
    console.warn(`[exam-engine] ⚠️  could not load authored exams (built-ins still serve): ${err?.message ?? err}`);
  }
}

// ── Read accessors (from the in-memory cache) ───────────────────────────────

export function getEngineConfig(): EngineConfig {
  if (!MERGED) throw new Error('[exam-engine] config not loaded — call loadExamEngine() at startup');
  return MERGED;   // file built-ins + published authored exams (built-ins win on collision)
}

export function getExamConfig(examId: string): ExamConfigEntry | null {
  return getEngineConfig().exams[examId] ?? null;
}

/** Is this a FILE built-in (IELTS/SE/OET/…)? Built-ins are file-locked — the dashboard
 *  may never author or overwrite them. Reads the pure file config, not the merged view. */
export function isBuiltinExam(examId: string): boolean {
  return !!CONFIG?.exams[examId];
}

export function listExamConfigs(): ExamConfigEntry[] {
  return Object.values(getEngineConfig().exams);
}

export function getScale(scaleId: string): any {
  return getEngineConfig().scales[scaleId] ?? null;
}

export function getEngineVersion(): string {
  return getEngineConfig().engine_version;
}

export function getConfigVersion(): string {
  return getEngineConfig().config_version;
}

/**
 * Provenance (B9). Spread onto every stored result row — the columns
 * engine_version + config_version exist on assessment_history and viva_answers.
 * Wiring the write paths through this happens in Phase 6/8.
 */
export function provenance(): { engine_version: string; config_version: string } {
  const cfg = getEngineConfig();
  return { engine_version: cfg.engine_version, config_version: cfg.config_version };
}
