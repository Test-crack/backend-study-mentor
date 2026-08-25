// Viva scoring core (deterministic, testable). Turns per-prompt graded responses
// into a final CEFR result: apply guardrails → per-subskill mean → aggregate via the
// exam-engine's cefr_hybrid. No external services — pure logic over the grader's output.
import { cefrHybrid } from '../../exam-engine';
import { VivaRubric, GradedResponse, VivaResult, CefrLevel, LEVEL_ORDER } from './types';

/** Cap a level at a maximum (for short/off-topic guardrails). */
export function capLevel(level: CefrLevel, cap: CefrLevel): CefrLevel {
  return LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(cap) ? cap : level;
}

/** A response is unusable (→ excluded from all subskill averages) when… */
function isNoResponse(r: GradedResponse, rubric: VivaRubric): boolean {
  return Boolean(r.flags?.noResponse || r.flags?.nonEnglish || r.flags?.inaudible)
    || (r.wordCount ?? 0) < rubric.guardrails.minWords
    || !r.levels || Object.keys(r.levels).length === 0;
}

/** Effective per-subskill levels for one response after guardrail caps (null = no usable response). */
export function applyGuardrails(r: GradedResponse, rubric: VivaRubric): Record<string, CefrLevel> | null {
  if (isNoResponse(r, rubric)) return null;
  const g = rubric.guardrails;
  const short = !r.isWarmup && (r.wordCount ?? 0) < g.shortWords;
  const out: Record<string, CefrLevel> = {};
  for (const ss of rubric.subskills) {
    let lv = (r.levels?.[ss.id] ?? 'below_a1') as CefrLevel;
    if (short) lv = capLevel(lv, g.shortCap);                                   // short → cap all
    if (r.flags?.offTopic && g.offTopicCappedSubskills.includes(ss.id)) {       // off-topic → cap listed subskills
      lv = capLevel(lv, g.offTopicCap);
    }
    out[ss.id] = lv;
  }
  return out;
}

/**
 * Aggregate all prompt responses into the final CEFR result.
 * `scale` is the cefr_6 scale object (injected for testability; at runtime pass getScale(rubric.scaleId)).
 */
export function aggregateViva(responses: GradedResponse[], rubric: VivaRubric, scale: any): VivaResult {
  // Keep each response paired with its guarded levels so we can honour per-prompt
  // subskill scoping (e.g. a read-aloud contributes phonology/fluency only).
  const guarded = responses.map((r) => ({ r, levels: applyGuardrails(r, rubric) }));
  const noResponseCount = guarded.filter((g) => g.levels === null).length;
  const scoredCount = guarded.length - noResponseCount;

  if (noResponseCount >= rubric.guardrails.withholdNoResponseCount) {
    return {
      status: 'withheld',
      withholdReason: `${noResponseCount} of ${responses.length} prompts had no usable response`,
      noResponseCount, scoredPromptCount: scoredCount,
    };
  }

  // Per-subskill mean of level→scores across the scored responses. A response only
  // counts toward a subskill when it has no scope, or its scope includes that subskill.
  const subskillPercents: Record<string, number> = {};
  for (const ss of rubric.subskills) {
    const vals = guarded
      .filter((g) => g.levels !== null && (!g.r.scoredSubskills || g.r.scoredSubskills.includes(ss.id)))
      .map((g) => rubric.levelToScore[(g.levels as Record<string, CefrLevel>)[ss.id]]);
    subskillPercents[ss.id] = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : rubric.levelToScore.below_a1;
  }

  const agg: any = cefrHybrid(subskillPercents, scale);
  return {
    status: 'scored',
    cefrLevel: agg.value,
    cefrLabel: agg.label,
    meanScore: agg.average_pct,
    subskillProfile: agg.profile.map((p: any) => ({
      id: p.id,
      label: rubric.subskills.find((s) => s.id === p.id)?.label ?? p.id,
      level: p.value,
      score: p.percent,
    })),
    feedback: responses
      .filter((r) => r.feedback && (r.feedback.strengths || r.feedback.improvements))
      .map((r) => ({ promptId: r.promptId, strengths: r.feedback!.strengths, improvements: r.feedback!.improvements })),
    scoredPromptCount: scoredCount,
    noResponseCount,
  };
}
