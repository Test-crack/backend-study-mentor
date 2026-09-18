/**
 * Per-question cache, so re-running after fixing three rows does not re-pay for
 * the other 3,797.
 *
 * The key is a hash of everything that could change a verdict: the question, its
 * options, the stored answer, the stored explanation, the model name, the prompt
 * template version, and the vote count. Miss any of those and the cache starts
 * lying — serving a verdict that was produced under different conditions than the
 * ones currently in force.
 *
 * One JSON file per source CSV, which keeps each file small enough to rewrite
 * atomically and makes it obvious which cache belongs to which batch.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DrillCsvRow } from '../shared/types';
import type { RowJudgement } from './types';

export const CACHE_DIR = path.resolve(__dirname, '..', '..', 'cache', 'layer2-content-judge');

export interface CacheKeyInput {
  row: DrillCsvRow;
  model: string;
  templateVersion: string;
  votes: number;
}

/** Content-addressed key. Any edit to the question re-judges only that question. */
export function cacheKey({ row, model, templateVersion, votes }: CacheKeyInput): string {
  const material = JSON.stringify([
    row.prompt_text,
    row.options,
    row.correct_answer,
    row.explanation,
    model,
    templateVersion,
    votes,
  ]);
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/** Filesystem-safe cache filename for a source CSV. */
function cacheFileFor(sourcePath: string): string {
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  const disambiguator = crypto
    .createHash('sha256')
    .update(path.resolve(sourcePath))
    .digest('hex')
    .slice(0, 8);
  return path.join(CACHE_DIR, `${safe}.${disambiguator}.json`);
}

type CacheContents = Record<string, RowJudgement>;

export class JudgementCache {
  private readonly file: string;
  private entries: CacheContents = {};
  private dirty = false;

  constructor(sourcePath: string) {
    this.file = cacheFileFor(sourcePath);
  }

  load(): void {
    try {
      const text = fs.readFileSync(this.file, 'utf8');
      const parsed: unknown = JSON.parse(text);
      // A corrupt cache is discarded rather than trusted. Losing a cache costs
      // money; using a bad one costs correctness.
      this.entries =
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as CacheContents)
          : {};
    } catch {
      this.entries = {};
    }
  }

  get(key: string): RowJudgement | null {
    const hit = this.entries[key];
    return hit ? { ...hit, cached: true } : null;
  }

  set(key: string, judgement: RowJudgement): void {
    // Never cache an outcome that means "we did not find out". Otherwise a
    // transient API outage would be frozen in as a permanent non-answer.
    if (judgement.outcome === 'UNJUDGED') return;
    this.entries[key] = { ...judgement, cached: false };
    this.dirty = true;
  }

  save(): void {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.entries, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }

  get path(): string {
    return this.file;
  }
}

/** Remove every cached judgement. Used by `--no-cache --clear-cache`. */
export function clearCache(): number {
  if (!fs.existsSync(CACHE_DIR)) return 0;
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));
  return files.length;
}
