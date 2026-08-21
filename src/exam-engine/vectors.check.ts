// Exam Engine — vector runner (CI gate). Reproduces EE-02 / run-vectors.js §0–§8
// against OUR TypeScript engine. Exits non-zero on any failure.
//   npm run exam-engine:vectors
//
// This is the objective bar for B2–B6 + progression: 75 checks, 0 failures.

import fs from 'fs';
import path from 'path';
import { validateConfig } from './validator';
import {
  roundHalfUpToStep, tidy, pctToLevel, withinLevelProgress,
  bandMean, cefrHybrid,
} from './scoring';
import { numericMomentum, ordinalMomentum, trend, buildEnvelope } from './progression';

const cfg: any = JSON.parse(fs.readFileSync(path.join(__dirname, 'exam-engine-config.v2.json'), 'utf8'));
const BAND = cfg.scales.ielts_band;
const CEFR = cfg.scales.cefr_6;

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(58)} got=${a}${ok ? '' : `  want=${e}`}`);
}
function head(t: string) { console.log(`\n── ${t}`); }

// §0 config validation
head('§0  Config validation');
const v = validateConfig(cfg);
check('config has zero validation errors', v.errors.length, 0);

// §1 rounding helper
head('§1  roundHalfUpToStep(v, 0.5)');
([[6.25, 6.5], [6.75, 7.0], [6.24, 6.0], [6.26, 6.5], [5.75, 6.0], [5.74, 5.5],
  [6.5, 6.5], [0.25, 0.5], [-0.25, 0.0]] as [number, number][]).forEach(([i, o]) =>
  check(`  ${i}`, tidy(roundHalfUpToStep(i, 0.5)), o));

// §2 IELTS band_mean
head('§2  IELTS band_mean — overall');
const ieltsRows = [
  { s: { l: 6.0, r: 6.5, w: 6.0, sp: 6.5 }, mean: 6.25, band: 6.5 },
  { s: { l: 7.0, r: 6.5, w: 7.0, sp: 6.5 }, mean: 6.75, band: 7.0 },
  { s: { l: 6.0, r: 6.0, w: 6.5, sp: 6.0 }, mean: 6.125, band: 6.0 },
  { s: { l: 6.5, r: 6.5, w: 6.0, sp: 6.5 }, mean: 6.375, band: 6.5 },
  { s: { l: 3.0, r: 4.0, w: 3.5, sp: 3.5 }, mean: 3.5, band: 4.0 },
  { s: { l: 9.0, r: 9.0, w: 9.0, sp: 9.0 }, mean: 9.0, band: 9.0 },
];
ieltsRows.forEach((r) => {
  const out = bandMean(r.s, BAND);
  check(`  mean ${r.mean}`, [out.continuous_mean, out.value], [r.mean, r.band]);
});
const clampRow = bandMean({ l: 3.0, r: 4.0, w: 3.5, sp: 3.5 }, BAND);
check('  clamp row reports clamped=true', clampRow.clamped, true);
check('  clamp row keeps raw 3.5 for improvement maths', clampRow.value_raw, 3.5);

// §3 CEFR level mapping
head('§3  pctToLevel — corrected GSE-derived thresholds');
([[0, 'below_a1'], [14, 'below_a1'], [14.99, 'below_a1'], [15, 'a1'], [24, 'a1'], [25, 'a2'],
  [41, 'a2'], [41.25, 'b1'], [55, 'b1'], [61, 'b1'], [61.25, 'b2'], [82.49, 'b2'], [82.5, 'c1'],
  [93.74, 'c1'], [93.75, 'c2'], [100, 'c2']] as [number, string][]).forEach(([p, l]) =>
  check(`  ${p}%`, pctToLevel(p, CEFR), l));

// §4 cefr_hybrid overall + profile
head('§4  cefr_hybrid — overall + full profile');
const sub = { range: 60, accuracy: 55, fluency: 62, interaction: 50, coherence: 58, phonology: 45 };
const cef = cefrHybrid(sub, CEFR);
check('  average pct', cef.average_pct, 55);
check('  overall level', cef.value, 'b1');
check('  within-level progress', cef.within_level_progress, 0.6875);
check('  profile length (never dropped)', cef.profile.length, 6);
check('  phonology 45% maps to', cef.profile.find((p) => p.id === 'phonology')!.value, 'b1');

// §5 progression / momentum
head('§5  IELTS momentum — rounding-interval model');
const capped = numericMomentum(9.0, 9.0, BAND);
check('  at the 9.0 cap, next_rung is null', capped.next_rung, null);
check('  at the 9.0 cap, progress_to_next is null', capped.progress_to_next, null);
// spot-check a mid value: mean 5.90 -> headline 6.0 -> next 6.5 @ 0.30
const mid = numericMomentum(5.90, 6.0, BAND);
check('  mean 5.90 -> next_rung 6.5', mid.next_rung, 6.5);
check('  mean 5.90 -> progress 0.30', mid.progress_to_next, 0.3);

head('§5b  CEFR momentum');
const m55 = ordinalMomentum(55, 'b1', CEFR);
check('  avg 55 -> next', m55.next_rung, 'b2');
check('  avg 55 -> progress', m55.progress_to_next, 0.6875);
const m95 = ordinalMomentum(95, 'c2', CEFR);
check('  avg 95 at c2 -> next is null', m95.next_rung, null);
check('  avg 95 at c2 -> progress_to_next is null', m95.progress_to_next, null);
check('  avg 95 at c2 -> within_level_progress still shown', m95.within_level_progress, 0.2);

head('§5c  Trend (window 3, within one instrument)');
([[[5.0, 5.5, 6.0], 'up'], [[6.0, 6.0, 6.0], 'flat'], [[6.5, 6.0, 5.5], 'down'],
  [[4.0, 7.0, 5.0], 'up']] as [number[], string][]).forEach(([vals, t]) =>
  check(`  ${JSON.stringify(vals)}`, trend(vals, 3), t));

// §6 the invariant
head('§6  Envelope invariant');
const okEnv = buildEnvelope({
  examId: 'ielts', strategy: 'band_mean',
  overall: bandMean({ l: 6, r: 6, w: 6, sp: 5.5 }, BAND),
  momentum: numericMomentum(5.875, 6.0, BAND),
  baseline: { value: 4.0, label: '4.0' }, history: [5.0, 5.5, 6.0], trendWindow: 3,
  engineVersion: '2.0.0', configVersion: '2.0.0',
});
check('  valid envelope: headline == overall', okEnv.progression.headline.value, okEnv.overall.value);
// B9: provenance stamped on the envelope
check('  aggregate envelope carries config_version', okEnv.config_version, '2.0.0');

// B8: per_component envelope — overall is null, no progression ladder, still valid
head('§6b  per_component envelope (OET/GRE/GMAT)');
const perComp = buildEnvelope({
  examId: 'oet', strategy: null, mode: 'per_component',
  components: [
    { id: 'listening', assessed: true, kind: 'oet_score', value: 350, display: '350 (B)' },
    { id: 'reading', assessed: true, kind: 'oet_score', value: 360, display: '360 (B)' },
  ],
  engineVersion: '2.0.0', configVersion: '2.0.0',
});
check('  per_component: overall is null', perComp.overall, null);
check('  per_component: no progression ladder', perComp.progression, null);
check('  per_component: components preserved', perComp.components.length, 2);
check('  per_component: provenance stamped', perComp.engine_version, '2.0.0');

// §7 per-component exams
head('§7  Exams with no computable headline');
(['oet', 'gre', 'gmat'] as const).forEach((id) => {
  const ex = cfg.exams[id];
  check(`  ${id}: overall.mode`, ex.overall.mode, 'per_component');
  check(`  ${id}: no aggregate strategy`, ex.overall.strategy, null);
});
check('  gmat_total is declared but not computable', cfg.scales.gmat_total.computable, false);
check('  gre unofficial V+Q aggregate is disabled', cfg.exams.gre.overall.unofficial_aggregate.enabled, false);

// §8 OET grade banding
head('§8  OET grade banding');
const oet = cfg.scales.oet_500;
function oetGrade(score: number): string | null {
  const b = oet.grade_bands.find((b: any) => score >= b.min && score <= b.max);
  return b ? b.grade : null;
}
([[500, 'A'], [450, 'A'], [440, 'B'], [350, 'B'], [340, 'C+'], [300, 'C+'], [290, 'C'], [200, 'C'],
  [190, 'D'], [100, 'D'], [90, 'E'], [0, 'E']] as [number, string][]).forEach(([s, g]) =>
  check(`  ${s}`, oetGrade(s), g));
const sortedBands = [...oet.grade_bands].sort((a: any, b: any) => a.min - b.min);
check('  bands tile the scale at step 10',
  sortedBands.every((b: any, i: number) => i === 0 || b.min - sortedBands[i - 1].max === oet.step), true);

// summary
console.log(`\n${'='.repeat(70)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(70));
process.exit(fail ? 1 : 0);
