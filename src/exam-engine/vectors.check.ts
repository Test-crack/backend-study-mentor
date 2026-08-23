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
  bandMean, cefrHybrid, proficiencyLevel, difficulty, weaknessGap,
} from './scoring';
import { numericMomentum, ordinalMomentum, trend, buildEnvelope } from './progression';
import { bandToLevel, bandToDifficulty, bandGap, toBand, fractionToBand, internalToBand } from '../lib/bandScale';
import { componentBand } from './component';

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

// §9 proficiency / difficulty / weakness-gap parity vs bandScale (Phase 6 extraction gate)
head('§9  Proficiency + weakness-gap — engine == bandScale across the grid');
{
  const grid: number[] = [];
  for (let b = 0; b <= 10.0001; b += 0.1) grid.push(tidy(b, 1));
  grid.push(5.5, 7.0, 4.0, 9.0, 3.0, 9.5);   // exact cut edges + out-of-range
  let mism = 0;
  for (const b of grid) {
    const ok = proficiencyLevel(b, BAND) === bandToLevel(b)
      && difficulty(b, BAND) === bandToDifficulty(b)
      && weaknessGap(b, BAND) === bandGap(b);
    if (!ok) {
      mism++;
      console.log(`  FAIL band ${b}  lvl ${proficiencyLevel(b, BAND)}/${bandToLevel(b)}  diff ${difficulty(b, BAND)}/${bandToDifficulty(b)}  gap ${weaknessGap(b, BAND)}/${bandGap(b)}`);
    }
  }
  check(`  ${grid.length} bands: engine level+difficulty+gap identical to bandScale`, mism, 0);
  // spot-check the exact cut boundaries read from config
  check('  5.5 -> B (cut boundary)', proficiencyLevel(5.5, BAND), 'B');
  check('  7.0 -> C (cut boundary)', proficiencyLevel(7.0, BAND), 'C');
  check('  gap at 4.0 is fully weak', weaknessGap(4.0, BAND), 1);
  check('  gap at 9.0 is zero', weaknessGap(9.0, BAND), 0);

  // facade resolution: the exam's overall scale is the one carrying the new cuts,
  // so examDifficulty('ielts', b) resolves to this BAND and matches bandScale.
  const ieltsScaleId = cfg.exams.ielts.overall.scale;
  check('  ielts overall scale id', ieltsScaleId, 'ielts_band');
  check('  resolved scale has proficiency_bands', Array.isArray(cfg.scales[ieltsScaleId].proficiency_bands), true);
  check('  resolved scale has weakness_gap.from', typeof cfg.scales[ieltsScaleId].weakness_gap.from, 'number');
}

// §10 scoreComponent parity vs bandScale (Phase 6 Part 1b — component production)
head('§10  componentBand — engine == bandScale across the grid');
{
  let mism = 0, n = 0;
  // objective raw (correct/total) — Listening/Reading MCQ
  for (let total = 1; total <= 40; total++) {
    for (let correct = 0; correct <= total; correct++) {
      n++;
      const eng = componentBand({ unit: 'raw', correct, total }, BAND).value;
      const old = fractionToBand(correct / total);
      if (eng !== old) { mism++; console.log(`  FAIL raw ${correct}/${total} eng=${eng} old=${old}`); }
    }
  }
  // AI internal 1..10 (0.1 steps) — blend result
  for (let s = 1; s <= 10.0001; s = tidy(s + 0.1, 1)) {
    n++;
    const eng = componentBand({ unit: 'internal', value: s, min: 1, max: 10 }, BAND).value;
    const old = internalToBand(s);
    if (eng !== old) { mism++; console.log(`  FAIL internal ${s} eng=${eng} old=${old}`); }
  }
  // band pass-through (mean-of-criteria) — 0.25 steps across [3,10]
  for (let b = 3.0; b <= 10.0001; b = tidy(b + 0.25, 2)) {
    n++;
    const eng = componentBand({ unit: 'band', value: b, scale: 'ielts_band' }, BAND).value;
    const old = toBand(b);
    if (eng !== old) { mism++; console.log(`  FAIL band ${b} eng=${eng} old=${old}`); }
  }
  check(`  ${n} component inputs identical to bandScale (raw/internal/band)`, mism, 0);
}

// §11 AI-service aggregation parity: band_mean(4 criteria) == toBand(mean) (Phase 6 Part 3)
head('§11  AI mean-of-criteria — band_mean == toBand(avg) across all 0.5-step quads');
{
  const vals: number[] = [];
  for (let b = 4.0; b <= 9.0001; b = tidy(b + 0.5, 1)) vals.push(b);
  let mism = 0, n = 0;
  for (const a of vals) for (const b of vals) for (const c of vals) for (const d of vals) {
    n++;
    const eng = bandMean({ a, b, c, d }, BAND).value;
    const old = toBand((a + b + c + d) / 4);
    if (eng !== old) { mism++; if (mism <= 5) console.log(`  FAIL [${a},${b},${c},${d}] eng=${eng} old=${old}`); }
  }
  check(`  ${n} criterion quads: band_mean identical to toBand(avg)`, mism, 0);
}

// summary
console.log(`\n${'='.repeat(70)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(70));
process.exit(fail ? 1 : 0);
