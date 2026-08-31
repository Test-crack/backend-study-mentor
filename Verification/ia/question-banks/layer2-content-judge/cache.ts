/**
 * Per-question cache. Same rationale and shape as drills'/diagnostic's — one
 * JSON file per source CSV, keyed by a hash of everything that could change
 * a verdict. `UNJUDGED` is never cached, so an outage can't freeze into a
 * permanent non-answer.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { IACsvRow } from '../shared/types';
import type { AnswerRowJudgement, PromptRowJudgement } from './types';

export const CACHE_DIR = path.resolve(__dirname, '..', '..', 'cache', 'layer2-content-judge');

export interface CacheKeyInput {
  row: IACsvRow;
  model: string;
  templateVersion: string;
}

export function cacheKey({ row, model, templateVersion }: CacheKeyInput): string {
  const material = JSON.stringify([
    row.question_type,
    row.prompt_text,
    row.options,
    row.correct_answer,
    row.passage_text,
    row.audio_url,
    model,
    templateVersion,
  ]);
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

function cacheFileFor(sourcePath: string): string {
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  const disambiguator = crypto.createHash('sha256').update(path.resolve(sourcePath)).digest('hex').slice(0, 8);
  return path.join(CACHE_DIR, `${safe}.${disambiguator}.json`);
}

type Judgement = AnswerRowJudgement | PromptRowJudgement;
type CacheContents = Record<string, Judgement>;

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
      this.entries = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CacheContents) : {};
    } catch {
      this.entries = {};
    }
  }

  get(key: string): Judgement | null {
    const hit = this.entries[key];
    return hit ? { ...hit, cached: true } : null;
  }

  set(key: string, judgement: Judgement): void {
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

export function clearCache(): number {
  if (!fs.existsSync(CACHE_DIR)) return 0;
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));
  return files.length;
}
