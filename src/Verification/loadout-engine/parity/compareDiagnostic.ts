/**
 * Parity harness for the fourth loadout: IELTS Diagnostic.
 *
 * Diagnostic is the outlier: no bucket (a batch is one staging file), no source
 * keys (its importer replaces whole sets), and rows organised into numbered sets
 * the other three have no equivalent of.
 *
 * Usage:
 *   npx tsx src/Verification/loadout-engine/parity/compareDiagnostic.ts
 */

import path from 'path';

import { verifyRun as verifyRunDiagnostic } from '../../diagnostic/question-banks/layer1-verifier/verify';
import { compareFork, reportParity, type ForkParityReport, type GenericRun } from './compareFork';
import type { Loadout } from '../loadout/schema';

export const DIAGNOSTIC_FIXTURES_DIR = path.join(__dirname, '__fixtures__', 'diagnostic');

export function compareDiagnostic(fallback: number, override?: Loadout): ForkParityReport {
  return compareFork({
    forkName: 'diag',
    dirs: [DIAGNOSTIC_FIXTURES_DIR],
    loadoutFile: 'ielts-diagnostic.json',
    fallback,
    override,
    runFork: (files, n) => verifyRunDiagnostic(files, { count: n }) as unknown as GenericRun,
    // Diagnostic files have no bucket at all, so there is nothing to render.
    renderForkBucket: () => null,
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--expected');
  const fallback = Number(i === -1 ? 2 : argv[i + 1]);
  process.exitCode = reportParity(
    'IELTS Diagnostic fixtures',
    compareDiagnostic(fallback),
    fallback,
  );
}
