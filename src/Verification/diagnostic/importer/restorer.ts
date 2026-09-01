/**
 * Pure planning core of the diagnostic restore tool — split out of
 * restore.ts's main() the same way importer.ts was split out of cli.ts's.
 * restore.ts is now a thin wrapper: same flags, same console output, same
 * exit codes, calling this instead of doing the work inline.
 */

export class RestorePlanError extends Error {}

export interface BackedUpRow {
  id: string;
  set_id: string;
  sequence: number;
  skill: string;
  level: string;
  question_type: string;
  prompt_text: string;
  options: unknown;
  correct_answer: string | null;
  min_words: number | null;
  passage_text: string | null;
  audio_url: string | null;
  created_at: string;
}

export interface RestorePlan {
  setId: string;
  rows: BackedUpRow[];
}

/**
 * Parse a backup file's contents and validate it: every row must belong to
 * the same set_id (backup files are never hand-edited to mix sets), and the
 * file must contain at least one row. Throws RestorePlanError — with the
 * exact message text restore.ts has always printed — on any problem.
 */
export function parseBackup(rawJson: string, fileLabel: string): RestorePlan {
  let rows: BackedUpRow[];
  try {
    rows = JSON.parse(rawJson);
  } catch (err) {
    throw new RestorePlanError(`Backup file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new RestorePlanError(`Backup file has no rows to restore: ${fileLabel}`);
  }

  const setId = rows[0].set_id;
  const inconsistent = rows.find(r => r.set_id !== setId);
  if (inconsistent) {
    throw new RestorePlanError(
      `Backup file has rows from more than one set_id (${setId} and ${inconsistent.set_id}) — this shouldn't happen; don't hand-edit backup files.`,
    );
  }

  return { setId, rows };
}

/**
 * Confirm every row in the backup still has a live id in the given set —
 * a restore against an already-changed-again set must fail loudly instead
 * of silently overwriting whatever's there now with possibly-stale ids.
 * Throws RestorePlanError (exact original message text) if any are missing.
 */
export function assertRestorable(plan: RestorePlan, liveIds: Set<string>): void {
  const missing = plan.rows.filter(r => !liveIds.has(r.id));
  if (missing.length > 0) {
    throw new RestorePlanError(
      `${missing.length} row id(s) from this backup no longer exist in set "${plan.setId}" — the set may have ` +
        `changed again since this backup was taken. Refusing to restore against a moved target.`,
    );
  }
}
