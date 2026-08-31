// Viva config registry — the ONE place that maps an examId to its viva rubric and
// diagnostic prompt set. Onboarding a new viva exam = add its rubric + prompts and
// register them here; the controller and pipeline stay untouched. This is what makes
// the diagnostic viva flow config-driven rather than per-exam code.
import { VivaRubric, VivaPrompt } from './types';
import { SPOKEN_ENGLISH_RUBRIC } from './rubrics/spokenEnglish';
import { SPOKEN_ENGLISH_PROMPTS } from './prompts/spokenEnglish';

interface VivaExamConfig {
  rubric: VivaRubric;
  prompts: VivaPrompt[];
}

const VIVA_EXAMS: Record<string, VivaExamConfig> = {
  spoken_english: { rubric: SPOKEN_ENGLISH_RUBRIC, prompts: SPOKEN_ENGLISH_PROMPTS },
};

/** True if this exam's diagnostic is a viva (record-and-submit speaking). */
export function isVivaExam(examId: string): boolean {
  return examId in VIVA_EXAMS;
}

/** The viva rubric for an exam, or null if the exam isn't viva-configured. */
export function getVivaRubric(examId: string): VivaRubric | null {
  return VIVA_EXAMS[examId]?.rubric ?? null;
}

/** The ordered diagnostic prompt set for an exam (empty if not viva-configured). */
export function getVivaPrompts(examId: string): VivaPrompt[] {
  return [...(VIVA_EXAMS[examId]?.prompts ?? [])].sort((a, b) => a.order - b.order);
}

/** Look up a single prompt by id within an exam (used to resolve server-trusted prompt text). */
export function getVivaPrompt(examId: string, promptId: string): VivaPrompt | null {
  return VIVA_EXAMS[examId]?.prompts.find((p) => p.id === promptId) ?? null;
}
