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

let CONFIG: EngineConfig | null = null;

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
/** Active per-exam configs from the DB, keyed by exam_id (A4 — DB-backed read path). */
async function loadActiveExamConfigs(): Promise<Record<string, ExamConfigEntry>> {
  const rows = await prisma.examConfig.findMany({
    where: { is_active: true },
    select: { exam_id: true, config: true },
  });
  const out: Record<string, ExamConfigEntry> = {};
  for (const r of rows) {
    // If duplicate actives ever exist, first wins (A4.2 enforces single-active on save).
    if (!(r.exam_id in out) && r.config && typeof r.config === 'object') {
      out[r.exam_id] = r.config as unknown as ExamConfigEntry;
    }
  }
  return out;
}

export async function loadExamEngine(): Promise<void> {
  // JSON is the bootstrap seed + structural source (scales/defaults/meta). It must be valid.
  const jsonCfg = readConfigFile();
  const jv = validateConfig(jsonCfg);
  jv.warnings.forEach((w) => console.warn(`[exam-engine] ⚠️  ${w}`));
  if (jv.errors.length) {
    throw new Error(
      `[exam-engine] JSON config invalid — ${jv.errors.length} error(s):\n` +
        jv.errors.map((e) => `  • ${e}`).join('\n')
    );
  }

  // DB-backed read path: seed the JSON version (idempotent), then read the ACTIVE per-exam
  // configs from the DB and merge them over the JSON exams (scales/defaults/meta stay JSON).
  // On a fresh deploy the DB was just seeded from the JSON, so the result is byte-identical
  // (zero-change). A DB/seed blip falls back to the JSON so the server still serves.
  let assembled: EngineConfig = jsonCfg;
  let dbCount = 0;
  try {
    await seedExamConfigs(jsonCfg);
    const dbExams = await loadActiveExamConfigs();
    dbCount = Object.keys(dbExams).length;
    if (dbCount) assembled = { ...jsonCfg, exams: { ...jsonCfg.exams, ...dbExams } };
  } catch (err: any) {
    console.warn(`[exam-engine] ⚠️  DB-backed config load failed (${err?.message ?? err}); serving JSON seed`);
    assembled = jsonCfg;
    dbCount = 0;
  }

  // Fail loud if what we're about to serve is invalid — a bad DB edit must refuse to boot,
  // not silently mis-score.
  const av = validateConfig(assembled);
  if (av.errors.length) {
    throw new Error(
      `[exam-engine] assembled (DB-backed) config invalid — ${av.errors.length} error(s):\n` +
        av.errors.map((e) => `  • ${e}`).join('\n')
    );
  }

  CONFIG = assembled;
  console.log(
    `[exam-engine] loaded config v${assembled.config_version} (engine v${assembled.engine_version}) — ` +
      `${Object.keys(assembled.exams).length} exams (${dbCount} from DB, read path DB-backed)`
  );
}

/** Upsert the Exam registry row + record this config version per exam (idempotent). */
async function seedExamConfigs(cfg: EngineConfig): Promise<void> {
  for (const [examId, exam] of Object.entries(cfg.exams)) {
    await prisma.exam.upsert({
      where: { id: examId },
      update: { label: exam?.naming?.public_display_name ?? examId, status: String(exam?.status ?? 'reserved') },
      create: { id: examId, label: exam?.naming?.public_display_name ?? examId, status: String(exam?.status ?? 'reserved') },
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

// ── Read accessors (from the in-memory cache) ───────────────────────────────

export function getEngineConfig(): EngineConfig {
  if (!CONFIG) throw new Error('[exam-engine] config not loaded — call loadExamEngine() at startup');
  return CONFIG;
}

export function getExamConfig(examId: string): ExamConfigEntry | null {
  return getEngineConfig().exams[examId] ?? null;
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
