// Dogfood / ops CLI for the config-verification engine. No DB, reads the config file directly.
//   npx tsx src/Verification/config/cli.ts                       # every exam in the file
//   npx tsx src/Verification/config/cli.ts --exam oet_nursing    # one exam
//   npx tsx src/Verification/config/cli.ts --file candidate.json # a candidate {exam, scales?} or bare exam
import { readFileSync } from 'fs';
import { join } from 'path';
import { verifyConfig } from './verify';
import { ConfigVerifyResult } from './types';

function badge(o: string): string {
  return o === 'pass' ? '✅ PASS' : o === 'warn' ? '⚠️  WARN' : '❌ FAIL';
}

function print(r: ConfigVerifyResult): void {
  console.log('\n' + '='.repeat(78));
  console.log(`${r.examId}   →   ${badge(r.outcome)}`);
  console.log('='.repeat(78));
  console.log(`\n[Layer 1 · structural] ${badge(r.layer1.outcome)}`);
  if (!r.layer1.findings.length) console.log('  (no structural issues — the engine can run this)');
  for (const f of r.layer1.findings) console.log(`  ${f.severity.toUpperCase()}: ${f.message}`);
  console.log(`\n[Layer 2 · interpretation] ${badge(r.layer2.outcome)}`);
  console.log(r.layer2.plainEnglish.split('\n').map((l) => '  ' + l).join('\n'));
}

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const examIdx = args.indexOf('--exam');

if (fileIdx >= 0 && args[fileIdx + 1]) {
  const doc = JSON.parse(readFileSync(args[fileIdx + 1], 'utf8'));
  const exam = doc.exam ?? doc;                 // accept {exam, scales} or a bare exam entry
  print(verifyConfig(exam, doc.scales ?? {}));
} else {
  const cfg = JSON.parse(readFileSync(join(process.cwd(), 'src/exam-engine/exam-engine-config.v2.json'), 'utf8'));
  const ids = examIdx >= 0 && args[examIdx + 1] ? [args[examIdx + 1]] : Object.keys(cfg.exams);
  let worstExit = 0;
  for (const id of ids) {
    const r = verifyConfig(cfg.exams[id], cfg.scales);
    print(r);
    worstExit = Math.max(worstExit, r.outcome === 'fail' ? 1 : r.outcome === 'warn' ? 0 : 0);
  }
  process.exit(worstExit);
}
