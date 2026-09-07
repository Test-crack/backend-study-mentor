// OET Writing grader (production) — profession-specific healthcare letter assessment.
//
// Grades a candidate's OET Writing letter (nursing: usually a referral/discharge/transfer/advice
// letter) on OET's REAL six analytic criteria and their published score ranges:
//
//   Purpose              0–3   Content              0–7   Conciseness & Clarity  0–7
//   Genre & Style        0–7   Organisation & Layout 0–7  Language               0–7
//
// Grade B (350+) requires Purpose ≥ 2 AND every other criterion ≥ 5 (OET's published gate). The
// engine's oet_500 scale owns the raw→score→grade mapping; this service owns the rubric (the OET
// assessor descriptors, the anti-gaming/clinical-fidelity rules) — the same Layer-A/Layer-B split
// the IELTS writing service uses. On any infra failure it THROWS — a fabricated score is never
// stored (the caller returns a retryable 502).
//
// Descriptors are OET's own analytic criteria (© OET, 2019 assessment criteria); wording here is
// paraphrased for the grader prompt, not reproduced from any secure paper.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getScale } from '../exam-engine';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Max raw per criterion and the Grade-B minimum for each (OET published thresholds).
const CRITERIA = [
  { id: 'purpose',              label: 'Purpose',                max: 3, bMin: 2 },
  { id: 'content',              label: 'Content',                max: 7, bMin: 5 },
  { id: 'conciseness_clarity',  label: 'Conciseness & Clarity',  max: 7, bMin: 5 },
  { id: 'genre_style',          label: 'Genre & Style',          max: 7, bMin: 5 },
  { id: 'organisation_layout',  label: 'Organisation & Layout',  max: 7, bMin: 5 },
  { id: 'language',             label: 'Language',               max: 7, bMin: 5 },
] as const;
const RAW_MAX = CRITERIA.reduce((s, c) => s + c.max, 0); // 38
const MIN_LETTER_WORDS = 25; // below this it cannot be a real letter → floor without spending an AI call

export interface OetWritingCriterion {
  label: string;
  score: number;      // integer within the criterion's range
  max: number;
  meets_b: boolean;
  rationale: string;  // one sentence, cites evidence from the letter
  evidence: string[]; // exact quotes from the letter supporting the score
}

export interface OetWritingResult {
  oetScore: number;                 // 0–500 (10-step), after the Grade-B gate
  grade: string;                    // A | B | C+ | C | D | E
  meetsGradeB: boolean;
  belowGradeB: string[];            // criterion labels below their Grade-B threshold
  rawScore: number;                 // 0–38
  isValidAttempt: boolean;
  wordCount: number;
  criteria: Record<string, OetWritingCriterion>;
  feedback: {
    overall_summary: string;
    strengths: string[];
    priority_action: string;        // the single most impactful fix before the next letter
  };
}

const clampInt = (v: any, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const roundToStep = (v: number, step: number) => Math.round(v / step) * step;

function gradeFor(value: number, scale: any): string {
  for (const b of scale?.grade_bands ?? []) if (value >= b.min && value <= b.max) return b.grade ?? b.level;
  return 'E';
}

/** Floor result for empty / trivial submissions — no AI call, all criteria 0 → oet 0 (E). */
function floorResult(wordCount: number): OetWritingResult {
  const criteria: Record<string, OetWritingCriterion> = {};
  for (const c of CRITERIA) {
    criteria[c.id] = { label: c.label, score: 0, max: c.max, meets_b: false, rationale: 'No assessable letter was submitted.', evidence: [] };
  }
  return {
    oetScore: 0, grade: 'E', meetsGradeB: false, belowGradeB: CRITERIA.map((c) => c.label),
    rawScore: 0, isValidAttempt: false, wordCount,
    criteria,
    feedback: {
      overall_summary: 'The response is too short to assess as a professional letter.',
      strengths: [],
      priority_action: 'Write a complete letter (~180–200 words) addressed to the named recipient, stating the reason for writing and the action required.',
    },
  };
}

export interface AnalyzeOetWritingParams {
  caseNotes: string;                 // the stimulus case notes
  task: string;                      // the writing instruction (recipient, letter type, focus)
  letter: string;                    // the candidate's letter
  profession?: string;               // 'nursing' (default)
}

export async function analyzeOetWriting(params: AnalyzeOetWritingParams): Promise<OetWritingResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const profession = params.profession || 'nursing';
  const letter = (params.letter ?? '').trim();
  const wordCount = letter ? letter.split(/\s+/).filter(Boolean).length : 0;

  // Trivial / empty → floor, no AI spend. OET has no word-count band, but a sub-25-word
  // response cannot be a genuine referral letter.
  if (wordCount < MIN_LETTER_WORDS) return floorResult(wordCount);

  const prompt = `You are a senior OET (Occupational English Test) Writing Assessor for ${profession}. You mark to OET's official analytic criteria. You do NOT inflate scores to encourage candidates: an inflated score sends a nurse into a real exam unprepared, and into clinical practice with unsafe written communication. Accuracy is your only job.

You are assessing a healthcare professional's letter written from CASE NOTES. This is professional clinical correspondence, not an essay.

=== TASK GIVEN TO THE CANDIDATE ===
${params.task || '(Write an appropriate letter using the case notes.)'}

=== CASE NOTES (the source of truth for all clinical facts) ===
${params.caseNotes || '(No case notes were provided with this task.)'}

=== CANDIDATE'S LETTER (${wordCount} words) ===
"""
${letter}
"""

Assess the letter on OET's SIX criteria. Score each as an INTEGER within its range.

1) PURPOSE (0–3) — is the reason for writing immediately clear and developed?
   3 = purpose immediately apparent in the opening (letter type, recipient's role, action required) and sustained.
   2 = purpose apparent but delayed, under-highlighted, or the required action only implied.
   1 = purpose unclear or buried; minimal expansion.
   0 = purpose obscured/misunderstood; reads as raw case notes.

2) CONTENT (0–7) — factual accuracy, relevance, and clinical prioritisation. THIS is where clinical fidelity is judged.
   - Penalise HARD: inventing any value, mis-transcribing a dose/date, or stating as fact a diagnosis the notes only raise as a query — even if the letter reads beautifully.
   - Reward selecting only what THIS recipient needs to act, in the right priority; penalise omitting a key management action or dumping irrelevant history.
   7 = all clinically relevant facts present and accurate, nothing irrelevant. 5 = most relevant info, minor omission or one unnecessary inclusion. 3 = key actions missing; recipient cannot proceed. 0 = minimal/no useful clinical content.

3) CONCISENESS & CLARITY (0–7) — no redundancy; every sentence earns its place. There is NO word-count penalty; a long letter that is fully relevant can still score 7. Penalise repetition and case-note reproduction.
   7 = no redundancy. 5 = some redundancy, slightly verbose, still clear. 4 = noticeable redundancy distracts. 0–3 = heavy repetition / verbatim case notes.

4) GENRE & STYLE (0–7) — professional clinical register and tone to this specific reader; correct conventions of the letter type.
   7–6 = consistently professional, formal, reader-appropriate. 5 = appropriate register, minor lapses. 0–4 = informal/conversational.

5) ORGANISATION & LAYOUT (0–7) — logical paragraphing (one idea per paragraph), sequencing, and letter layout (recipient, salutation, body, sign-off).
   7–6 = clear logical structure, smooth transitions. 5 = logical, mostly clear, minor layout issues. 0–4 = disorganised/poor sequencing.

6) LANGUAGE (0–7) — grammar, vocabulary, spelling, punctuation. Errors that alter clinical meaning are penalised most.
   7 = essentially error-free. 6 = very few minor errors, no impact. 5 = some minor errors, meaning clear. 4 = 1–2 errors that alter clinical meaning. 0–3 = multiple meaning-altering errors.

VALIDITY RULES:
- If the text is not a genuine letter attempt (random words, a copy of the case notes, off-task) set "is_valid_attempt": false and score every criterion 0–1.
- Judge Content against the CASE NOTES only. Do not credit clinically plausible information that is not in the notes; do not penalise the omission of information the notes do not contain.

Return ONLY this JSON object (no markdown, no commentary). Scores are integers.
{
  "is_valid_attempt": boolean,
  "criteria": {
    "purpose":             { "score": 0, "rationale": "one sentence citing evidence", "evidence": ["exact quote from the letter"] },
    "content":             { "score": 0, "rationale": "...", "evidence": ["..."] },
    "conciseness_clarity": { "score": 0, "rationale": "...", "evidence": ["..."] },
    "genre_style":         { "score": 0, "rationale": "...", "evidence": ["..."] },
    "organisation_layout": { "score": 0, "rationale": "...", "evidence": ["..."] },
    "language":            { "score": 0, "rationale": "...", "evidence": ["exact quote of an error, with the correction"] }
  },
  "overall_summary": "2–3 sentences: the letter's clinical-communication strengths and the main gap to Grade B.",
  "strengths": ["specific strength quoting the letter"],
  "priority_action": "the single most impactful change before the next letter — one concrete, practisable technique, not general advice"
}`;

  let evaluation: any = null;
  for (let attempt = 1; attempt <= 2 && !evaluation; attempt++) {
    try {
      // Retry with a small temperature bump: at temp 0 a transient JSON-serialisation glitch
      // (e.g. an unescaped quote when the model echoes the candidate's letter) recurs identically.
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: { temperature: attempt === 1 ? 0 : 0.3, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      let rawText = result.response.text().trim();
      if (rawText.startsWith('```')) rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in AI response.');
      evaluation = JSON.parse(jsonMatch[0]);
    } catch (err: any) {
      console.error(`[analyzeOetWriting] attempt ${attempt}/2 failed:`, err?.message ?? err);
    }
  }
  if (!evaluation) throw new Error('Failed to analyze OET writing with AI.');

  // Build the validated criteria + raw score. Clamp every score to its published range —
  // the prompt states the ranges, but the model is never trusted to stay inside them.
  const criteria: Record<string, OetWritingCriterion> = {};
  const belowGradeB: string[] = [];
  let rawScore = 0;
  for (const c of CRITERIA) {
    const node = evaluation?.criteria?.[c.id] ?? {};
    const score = clampInt(node.score, 0, c.max);
    const meets_b = score >= c.bMin;
    if (!meets_b) belowGradeB.push(c.label);
    rawScore += score;
    criteria[c.id] = {
      label: c.label, score, max: c.max, meets_b,
      rationale: typeof node.rationale === 'string' ? node.rationale : '',
      evidence: Array.isArray(node.evidence) ? node.evidence.filter((x: any) => typeof x === 'string').slice(0, 4) : [],
    };
  }

  const isValidAttempt = evaluation?.is_valid_attempt !== false;
  const meetsGradeB = belowGradeB.length === 0;

  // Map raw (0–38) onto the oet_500 scale, then apply OET's grade GATE: missing any Grade-B
  // threshold caps the estimate below B (OET: "one criterion at 4/7 typically results in <350").
  const scale = getScale('oet_500');
  const step = Number(scale?.step ?? 10);
  const max = Number(scale?.max ?? 500);
  let oetScore = roundToStep((rawScore / RAW_MAX) * max, step);
  const B_MIN = 350, CPLUS_MAX = 340;
  if (!meetsGradeB && oetScore >= B_MIN) oetScore = CPLUS_MAX;
  oetScore = Math.max(0, Math.min(max, oetScore));
  const grade = gradeFor(oetScore, scale);

  return {
    oetScore, grade, meetsGradeB, belowGradeB, rawScore, isValidAttempt, wordCount, criteria,
    feedback: {
      overall_summary: typeof evaluation?.overall_summary === 'string' ? evaluation.overall_summary : '',
      strengths: Array.isArray(evaluation?.strengths) ? evaluation.strengths.filter((x: any) => typeof x === 'string').slice(0, 4) : [],
      priority_action: typeof evaluation?.priority_action === 'string' ? evaluation.priority_action : '',
    },
  };
}
