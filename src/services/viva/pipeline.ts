// Viva grading pipeline — orchestrator. Grades each prompt's audio via the competence
// grader, then aggregates into a CEFR result. Generic: pass any exam's VivaRubric.
// v1 uses Gemini (transcribe + grade). ASR delivery metrics are optional evidence.
import { getScale } from '../../exam-engine';
import { VivaRubric, GradedResponse, VivaResult, CompetenceGrader } from './types';
import { geminiCompetenceGrader } from './geminiCompetenceGrader';
import { aggregateViva } from './scoring';

export interface PromptResponseInput {
  promptId: string;
  isWarmup?: boolean;
  audioPath: string;
  mimeType: string;
  promptText: string;
  scoredSubskills?: string[];   // restrict which subskills this prompt contributes to (e.g. read-aloud)
}

/** Grade a single prompt's audio → a GradedResponse (levels + flags + word count). */
export async function gradeResponse(
  input: PromptResponseInput,
  rubric: VivaRubric,
  grader: CompetenceGrader = geminiCompetenceGrader,
): Promise<GradedResponse> {
  const g = await grader.grade({
    audioPath: input.audioPath, mimeType: input.mimeType,
    promptText: input.promptText, rubric,
  });
  return {
    promptId: input.promptId,
    isWarmup: input.isWarmup,
    wordCount: g.wordCount,
    flags: g.flags,
    levels: g.levels,
    feedback: g.feedback,
    scoredSubskills: input.scoredSubskills,
  };
}

/** Grade a whole viva (all prompts) → the final CEFR result. */
export async function gradeViva(
  inputs: PromptResponseInput[],
  rubric: VivaRubric,
  grader: CompetenceGrader = geminiCompetenceGrader,
): Promise<VivaResult> {
  const responses = await Promise.all(inputs.map((i) => gradeResponse(i, rubric, grader)));
  const scale = getScale(rubric.scaleId); // cefr_6 from the loaded engine config
  return aggregateViva(responses, rubric, scale);
}
