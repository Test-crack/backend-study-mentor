// Competence grader (v1) — multimodal Gemini. Hears the audio, transcribes, and assigns
// a CEFR level per subskill against the rubric, plus a content classification → flags.
// Modeled on ieltsSpeakingService (same client + inlineData pattern). Behind the
// CompetenceGrader interface, so it can be swapped for GPT-4o-audio/Claude later.
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import { CompetenceGrader, CefrLevel, GradedResponse, VivaRubric } from './types';
import { SPOKEN_ENGLISH_GRADER_NOTES } from './rubrics/spokenEnglish';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function inlineAudio(path: string, mimeType: string) {
  return { inlineData: { data: fs.readFileSync(path).toString('base64'), mimeType } };
}

function buildPrompt(rubric: VivaRubric, promptText: string): string {
  const allowed = Object.keys(rubric.levelToScore).join(' | ');
  const rubricText = rubric.subskills
    .map((ss) => {
      const lines = Object.entries(ss.descriptors).map(([lv, d]) => `      ${lv}: ${d}`).join('\n');
      return `  ${ss.id} (${ss.label}):\n${lines}`;
    })
    .join('\n');
  const subskillIds = rubric.subskills.map((s) => `"${s.id}": "<level>"`).join(', ');

  return `You are a CEFR speaking examiner grading a student's spoken answer.

PROMPT THE STUDENT ANSWERED: "${promptText}"

STEP 1 — CONTENT CLASSIFICATION (mandatory). Classify the audio as exactly ONE:
  "empty"       : no speech / silence / only noise
  "inaudible"   : voice present but unintelligible (do NOT blame the student's pronunciation for a bad recording)
  "non_english" : speech is not in English
  "off_topic"   : audible English clearly unrelated to the prompt
  "adequate"    : enough relevant content to grade

STEP 2 — TRANSCRIBE the English speech. Give "transcript" and "word_count" (count meaningful words, exclude fillers).

STEP 3 — Score EACH subskill INDEPENDENTLY. Allowed levels: ${allowed}
${rubricText}

Notes: ${SPOKEN_ENGLISH_GRADER_NOTES}

Return ONLY this JSON (no prose):
{
  "content_assessment": "<one of the STEP 1 values>",
  "transcript": "<verbatim English transcript>",
  "word_count": <integer>,
  "levels": { ${subskillIds} }
}`;
}

export const geminiCompetenceGrader: CompetenceGrader = {
  async grade({ audioPath, mimeType, promptText, rubric }) {
    if (!GEMINI_API_KEY) throw new Error('[viva] GEMINI_API_KEY is missing');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    });

    const result = await model.generateContent([buildPrompt(rubric, promptText), inlineAudio(audioPath, mimeType)]);
    const parsed = JSON.parse(result.response.text());

    const ca = String(parsed.content_assessment ?? 'adequate');
    const flags: GradedResponse['flags'] = {};
    if (ca === 'empty') flags.noResponse = true;
    if (ca === 'inaudible') flags.inaudible = true;
    if (ca === 'non_english') flags.nonEnglish = true;
    if (ca === 'off_topic') flags.offTopic = true;

    return {
      levels: (parsed.levels ?? {}) as Record<string, CefrLevel>,
      transcript: String(parsed.transcript ?? ''),
      wordCount: Number(parsed.word_count ?? 0),
      flags,
      rationale: ca,
    };
  },
};
