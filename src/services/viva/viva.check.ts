// Viva scoring core check (CI gate). Verifies the deterministic scoring: level→score,
// guardrail caps, no-response withhold/exclusion, and CEFR aggregation.
//   npx ts-node --transpile-only src/services/viva/viva.check.ts
import fs from 'fs';
import path from 'path';
import { SPOKEN_ENGLISH_RUBRIC as R } from './rubrics/spokenEnglish';
import { capLevel, applyGuardrails, aggregateViva } from './scoring';
import { CefrLevel, GradedResponse } from './types';

const cfg: any = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../exam-engine/exam-engine-config.v2.json'), 'utf8')
);
const CEFR = cfg.scales.cefr_6;

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e; ok ? pass++ : fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(52)} got=${a}${ok ? '' : `  want=${e}`}`);
}
function head(t: string) { console.log(`\n── ${t}`); }

const uniform = (lv: CefrLevel): Record<string, CefrLevel> =>
  ({ range: lv, accuracy: lv, fluency: lv, interaction: lv, coherence: lv, phonology: lv });
const resp = (levels: Record<string, CefrLevel>, o: Partial<GradedResponse> = {}): GradedResponse =>
  ({ promptId: o.promptId ?? 'p', isWarmup: o.isWarmup, wordCount: o.wordCount ?? 50, flags: o.flags, levels });
const many = (n: number, r: GradedResponse) => Array.from({ length: n }, () => r);

// §A level→score + capLevel
head('§A  level→score + capLevel');
check('below_a1 → 15', R.levelToScore.below_a1, 15);
check('b1 → 46', R.levelToScore.b1, 46);
check('c2 → 87', R.levelToScore.c2, 87);
check('cap c1 at a2', capLevel('c1', 'a2'), 'a2');
check('cap a1 at a2 (no-op)', capLevel('a1', 'a2'), 'a1');

// §B guardrails
head('§B  guardrails');
check('short (20w) main prompt caps all at a2',
  applyGuardrails(resp(uniform('b2'), { wordCount: 20 }), R)!.range, 'a2');
check('short does NOT apply to warm-up',
  applyGuardrails(resp(uniform('b2'), { wordCount: 20, isWarmup: true }), R)!.range, 'b2');
const ot = applyGuardrails(resp(uniform('b2'), { flags: { offTopic: true } }), R)!;
check('off-topic caps Responsiveness (interaction) at a2', ot.interaction, 'a2');
check('off-topic caps Coherence at a2', ot.coherence, 'a2');
check('off-topic leaves Range at b2', ot.range, 'b2');
check('noResponse flag → null', applyGuardrails(resp(uniform('b1'), { flags: { noResponse: true } }), R), null);
check('under minWords (3) → null', applyGuardrails(resp(uniform('b1'), { wordCount: 3 }), R), null);
check('inaudible → null', applyGuardrails(resp(uniform('b1'), { flags: { inaudible: true } }), R), null);

// §C aggregation
head('§C  aggregation → CEFR');
const allB1 = aggregateViva(many(8, resp(uniform('b1'))), R, CEFR);
check('8× all-B1 → level b1', allB1.cefrLevel, 'b1');
check('8× all-B1 → mean 46', allB1.meanScore, 46);
check('profile has 6 subskills', allB1.subskillProfile!.length, 6);
check('Responsiveness label surfaces', allB1.subskillProfile!.find(s => s.id === 'interaction')!.label, 'Responsiveness');

const allC1 = aggregateViva(many(8, resp(uniform('c1'))), R, CEFR);
check('8× all-C1 → level c1', allC1.cefrLevel, 'c1');

const allShortB2 = aggregateViva(many(8, resp(uniform('b2'), { wordCount: 20 })), R, CEFR);
check('8× short B2 (capped a2) → a2', allShortB2.cefrLevel, 'a2');

// §D no-response handling
head('§D  no-response withhold / exclusion');
const fourEmpty = aggregateViva(
  [...many(4, resp(uniform('b1'), { flags: { noResponse: true } })), ...many(4, resp(uniform('b1')))], R, CEFR);
check('4/8 no-response → withheld', fourEmpty.status, 'withheld');
const oneEmpty = aggregateViva(
  [resp(uniform('b1'), { flags: { noResponse: true } }), ...many(7, resp(uniform('b1')))], R, CEFR);
check('1/8 no-response → scored (excluded from mean)', oneEmpty.status, 'scored');
check('1/8 no-response → still b1', oneEmpty.cefrLevel, 'b1');
check('1/8 no-response → noResponseCount 1', oneEmpty.noResponseCount, 1);

console.log(`\n${'='.repeat(64)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(64)}`);
process.exit(fail ? 1 : 0);
