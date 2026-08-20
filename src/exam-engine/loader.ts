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

  // Seeding needs the DB; a blip here must not take down the server, but an
  // invalid config (above) must. So: fatal validation, best-effort seed.
  try {
    await seedExamConfigs(cfg);
  } catch (err: any) {
    console.warn(`[exam-engine] ⚠️  could not seed exam_configs (engine still runs from cache): ${err?.message ?? err}`);
  }

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
