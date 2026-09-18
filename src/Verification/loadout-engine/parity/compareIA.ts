/**
 * Parity harness for the third loadout: IELTS Internal Assessment.
 *
 * IA mixes both shapes: drills' 3-dimensional bucket and matching key, with
 * mock's four question types and passage grouping. Its grouping is stricter —
 * every MCQ/TFNG row needs a passage_id.
 *
 * Usage:
 *   npx tsx src/Verification/loadout-engine/parity/compareIA.ts
 */

import path from 'path';

import { verifyRun as verifyRunIA } from '../../ia/question-banks/layer1-verifier/verify';
import { compareFork, reportParity, type ForkParityReport, type GenericRun } from './compareFork';
import type { Loadout } from '../loadout/schema';

/** The fork's own committed fixtures — clean content, three files. */
export const IA_FORK_FIXTURES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'ia',
  'question-banks',
  'layer1-verifier',
  '__fixtures__',
);

/**
 * Extra cases written for parity, kept here rather than added to the fork's
 * directory so the fork stays untouched. The fork's own three fixtures are
 * almost entirely clean, which exercises very few code paths.
 */
export const IA_EXTRA_FIXTURES_DIR = path.join(__dirname, '__fixtures__', 'ia');

export function compareIA(fallback: number, override?: Loadout): ForkParityReport {
  return compareFork({
    forkName: 'ia',
    dirs: [IA_FORK_FIXTURES_DIR, IA_EXTRA_FIXTURES_DIR],
    loadoutFile: 'ielts-ia.json',
    fallback,
    override,
    runFork: (files, n) =>
      verifyRunIA(files, { fallback: n, byDifficulty: {} }) as unknown as GenericRun,
    renderForkBucket: bucket => {
      if (!bucket) return null;
      const b = bucket as { skill: string; sub_skill: string; difficulty: string };
      return `${b.skill}/${b.sub_skill}/${b.difficulty}`;
    },
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--expected');
  const fallback = Number(i === -1 ? 5 : argv[i + 1]);
  process.exitCode = reportParity('IELTS IA fixtures', compareIA(fallback), fallback);
}
