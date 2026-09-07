// OET Speaking grader (production) — profession-specific clinical ROLE-PLAY assessment.
//
// OET Speaking is not a CEFR conversation: a healthcare professional runs one or more role-plays
// with a patient/carer (played by an interlocutor) and is assessed on NINE criteria in two groups —
//
//   LINGUISTIC (each 0–6):  Intelligibility · Fluency · Appropriateness of Language ·
//                           Resources of Grammar & Expression
//   CLINICAL COMMUNICATION (each 0–3):  Relationship-building · Understanding the patient's
//                           perspective · Providing structure · Information gathering · Information giving
//
// Grade B (350) ≈ predominantly 5/6 on the linguistic criteria and 2/3 on the clinical criteria.
// This is what makes OET a *healthcare* exam: the clinical-communication criteria assess patient-
// centred care, not just language. We reuse the viva grader's multimodal-audio technique (inline
// base64 audio → Gemini) but grade the OET criteria on the oet_500 scale. All role-plays are graded
// in ONE call, the way a single assessor rates a whole performance. Throws on infra failure — a
// fabricated score is never stored.
//
// Descriptors paraphrase OET's published Speaking assessment criteria (© CBLA); nothing is copied
// from a secure paper.
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import { getScale } from '../exam-engine';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const LINGUISTIC = [
  { id: 'intelligibility',          label: 'Intelligibility',                 max: 6, bMin: 5 },
  { id: 'fluency',                  label: 'Fluency',                         max: 6, bMin: 5 },
  { id: 'appropriateness_language', label: 'Appropriateness of Language',     max: 6, bMin: 5 },
  { id: 'grammar_expression',       label: 'Resources of Grammar & Expression', max: 6, bMin: 5 },
] as const;
const CLINICAL = [
  { id: 'relationship_building',  label: 'Relationship-building',                  max: 3, bMin: 2 },
  { id: 'patient_perspective',    label: "Understanding the patient's perspective", max: 3, bMin: 2 },
  { id: 'structure',              label: 'Providing structure',                    max: 3, bMin: 2 },
  { id: 'information_gathering',  label: 'Information gathering',                   max: 3, bMin: 2 },
  { id: 'information_giving',     label: 'Information giving',                      max: 3, bMin: 2 },
] as const;
const ALL = [...LINGUISTIC, ...CLINICAL];
const RAW_MAX = ALL.reduce((s, c) => s + c.max, 0); // 39

export interface OetSpeakingCriterion {
  label: string; group: 'linguistic' | 'clinical'; score: number; max: number; meets_b: boolean; rationale: string;
}
export interface OetSpeakingResult {
  oetScore: number; grade: string; meetsGradeB: boolean; belowGradeB: string[];
  rawScore: number; isValidAttempt: boolean;
  criteria: Record<string, OetSpeakingCriterion>;
  transcripts: string[];
  feedback: { overall_summary: string; clinical_communication: string; strengths: string[]; priority_action: string };
}

export interface OetRoleplayInput { audioPath: string; mimeType: string; scenario: string }
export interface AnalyzeOetSpeakingParams { roleplays: OetRoleplayInput[]; profession?: string }

const clampInt = (v: any, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const roundToStep = (v: number, step: number) => Math.round(v / step) * step;
function gradeFor(value: number, scale: any): string {
  for (const b of scale?.grade_bands ?? []) if (value >= b.min && value <= b.max) return b.grade ?? b.level;
  return 'E';
}
function inlineAudio(path: string, mimeType: string) {
  return { inlineData: { data: fs.readFileSync(path).toString('base64'), mimeType } };
}

function floorResult(): OetSpeakingResult {
  const criteria: Record<string, OetSpeakingCriterion> = {};
  for (const c of ALL) criteria[c.id] = { label: c.label, group: (c.max === 6 ? 'linguistic' : 'clinical'), score: 0, max: c.max, meets_b: false, rationale: 'No assessable spoken response was submitted.' };
  return {
    oetScore: 0, grade: 'E', meetsGradeB: false, belowGradeB: ALL.map((c) => c.label),
    rawScore: 0, isValidAttempt: false, criteria, transcripts: [],
    feedback: { overall_summary: 'No audible English role-play response was recorded.', clinical_communication: '', strengths: [], priority_action: 'Record your response to each role-play in a quiet space, speaking to the patient in clear, professional English.' },
  };
}

function buildPrompt(params: AnalyzeOetSpeakingParams): string {
  const profession = params.profession || 'nursing';
  const scenarios = params.roleplays
    .map((r, i) => `  Role-play ${i + 1} (Recording ${i + 1}):\n  ${r.scenario || '(scenario not provided)'}`)
    .join('\n\n');
  const ling = LINGUISTIC.map((c) => `    "${c.id}": <0-6>   // ${c.label}`).join('\n');
  const clin = CLINICAL.map((c) => `    "${c.id}": <0-3>   // ${c.label}`).join('\n');

  return `You are a certified OET (Occupational English Test) Speaking Assessor for ${profession}. You rate recorded clinical ROLE-PLAYS in which the health professional (the candidate) speaks with a patient or carer. You do NOT inflate scores: an inflated result sends a ${profession} into practice unable to communicate safely with patients. Accuracy is your only job.

${params.roleplays.length} role-play recording(s) follow this text, in order. The candidate plays the ${profession}; another voice plays the patient/carer. Grade ONLY the candidate's speech.

=== ROLE-PLAY SCENARIOS ===
${scenarios}

STEP 1 — CONTENT CHECK. If NONE of the recordings contain audible English speech from the candidate addressing the scenario (silence, noise, non-English, or clearly off-task), set "is_valid_attempt": false and score every criterion 0–1. Never blame a poor recording on the candidate's pronunciation.

STEP 2 — TRANSCRIBE the candidate's speech from each recording ("transcripts": [one string per recording]).

STEP 3 — Score the NINE OET criteria across ALL role-plays together (one holistic set of scores, as a single assessor would).

LINGUISTIC criteria (each 0–6; Grade B ≈ 5):
  • intelligibility — pronunciation, stress and intonation; how clearly a listener understands. (6 = readily intelligible throughout; 3 = frequent strain; 0 = largely unintelligible.)
  • fluency — pace and smoothness; natural flow without disruptive hesitation or repetition.
  • appropriateness_language — register, tone and professionalism suited to THIS patient (warmth without over-familiarity; no unexplained jargon).
  • grammar_expression — grammatical accuracy and range of vocabulary/expression for the task.

CLINICAL COMMUNICATION criteria (each 0–3; Grade B ≈ 2) — these assess patient-centred care:
  • relationship_building — appropriate, empathetic opening; respect; non-judgemental manner.
  • patient_perspective — elicits and acknowledges the patient's ideas, concerns and expectations; involves them in decisions.
  • structure — logical sequence, signposting, and appropriate management of the consultation.
  • information_gathering — purposeful questioning, active listening, clarifying and summarising.
  • information_giving — clear, organised explanation at the patient's level; checks understanding; avoids or explains jargon.

STEP 4 — FEEDBACK: an overall summary, one line specifically on clinical-communication (the healthcare differentiator), concrete strengths, and the single highest-impact next step. Reference what the candidate actually said. Never comment on accent.

Return ONLY this JSON (integers; no prose):
{
  "is_valid_attempt": boolean,
  "transcripts": ["<candidate transcript per recording>"],
  "criteria": {
${ling}
${clin}
  },
  "rationales": { "<criterion_id>": "one sentence citing what the candidate said" },
  "overall_summary": "2-3 sentences",
  "clinical_communication": "1-2 sentences on patient-centred communication",
  "strengths": ["specific strength referencing the candidate's words"],
  "priority_action": "one concrete, practisable next step"
}`;
}

export async function analyzeOetSpeaking(params: AnalyzeOetSpeakingParams): Promise<OetSpeakingResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const roleplays = (params.roleplays ?? []).filter((r) => r?.audioPath);
  if (roleplays.length === 0) return floorResult();

  const prompt = buildPrompt({ ...params, roleplays });
  const audioParts = roleplays.map((r) => inlineAudio(r.audioPath, r.mimeType || 'audio/webm'));

  let evaluation: any = null;
  for (let attempt = 1; attempt <= 2 && !evaluation; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: { temperature: attempt === 1 ? 0 : 0.3, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([prompt, ...audioParts]);
      let rawText = result.response.text().trim();
      if (rawText.startsWith('```')) rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in AI response.');
      evaluation = JSON.parse(jsonMatch[0]);
    } catch (err: any) {
      console.error(`[analyzeOetSpeaking] attempt ${attempt}/2 failed:`, err?.message ?? err);
    }
  }
  if (!evaluation) throw new Error('Failed to analyze OET speaking with AI.');

  const rationales = evaluation?.rationales ?? {};
  const criteria: Record<string, OetSpeakingCriterion> = {};
  const belowGradeB: string[] = [];
  let rawScore = 0;
  for (const c of ALL) {
    const score = clampInt(evaluation?.criteria?.[c.id], 0, c.max);
    const meets_b = score >= c.bMin;
    if (!meets_b) belowGradeB.push(c.label);
    rawScore += score;
    criteria[c.id] = { label: c.label, group: c.max === 6 ? 'linguistic' : 'clinical', score, max: c.max, meets_b, rationale: typeof rationales[c.id] === 'string' ? rationales[c.id] : '' };
  }

  const isValidAttempt = evaluation?.is_valid_attempt !== false;
  const meetsGradeB = belowGradeB.length === 0;

  // Map raw (0–39) onto oet_500, then apply the Grade-B gate: any criterion below its B threshold
  // caps the estimate below B. Conservative by design — the harm of over-estimating a clinician's
  // patient communication is greater than under-estimating it.
  const scale = getScale('oet_500');
  const step = Number(scale?.step ?? 10);
  const max = Number(scale?.max ?? 500);
  let oetScore = roundToStep((rawScore / RAW_MAX) * max, step);
  const B_MIN = 350, CPLUS_MAX = 340;
  if (!meetsGradeB && oetScore >= B_MIN) oetScore = CPLUS_MAX;
  oetScore = Math.max(0, Math.min(max, oetScore));

  return {
    oetScore, grade: gradeFor(oetScore, scale), meetsGradeB, belowGradeB, rawScore, isValidAttempt, criteria,
    transcripts: Array.isArray(evaluation?.transcripts) ? evaluation.transcripts.filter((x: any) => typeof x === 'string') : [],
    feedback: {
      overall_summary: typeof evaluation?.overall_summary === 'string' ? evaluation.overall_summary : '',
      clinical_communication: typeof evaluation?.clinical_communication === 'string' ? evaluation.clinical_communication : '',
      strengths: Array.isArray(evaluation?.strengths) ? evaluation.strengths.filter((x: any) => typeof x === 'string').slice(0, 4) : [],
      priority_action: typeof evaluation?.priority_action === 'string' ? evaluation.priority_action : '',
    },
  };
}
