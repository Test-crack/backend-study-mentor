import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import { BAND_MIN, toBand } from '../lib/bandScale';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI          = new GoogleGenerativeAI(GEMINI_API_KEY);

// Words that count as "meaningful" content (anything NOT in this set)
const FILLER_WORDS = new Set([
  'um', 'uh', 'hmm', 'hm', 'ah', 'er', 'erm', 'eh', 'mm', 'mhm',
  'oh', 'yeah', 'okay', 'ok', 'right', 'so', 'like', 'you', 'know',
]);

function countMeaningfulWords(transcript: string): number {
  return transcript
    .toLowerCase()
    .split(/\s+/)
    .filter(w => {
      const clean = w.replace(/[^a-z]/g, '');
      return clean.length > 1 && !FILLER_WORDS.has(clean);
    }).length;
}

/**
 * Hard-enforce scores based on content_assessment + transcript length.
 * Gemini's soft penalty instructions are unreliable — this is the safety net.
 */
function enforceScores(evaluation: any): any {
  const ca               = (evaluation.content_assessment ?? 'adequate').toLowerCase();
  const meaningful       = countMeaningfulWords(evaluation.transcript ?? '');
  const isEmptyOrNoise   = ['empty', 'noise_only', 'inaudible'].includes(ca) || meaningful === 0;
  const isMurmurOnly     = ca === 'murmur_only' || (meaningful > 0 && meaningful < 4);
  const isOffTopic       = ca === 'off_topic';
  const isTooShort       = ca === 'too_short' || (meaningful >= 4 && meaningful < 15);

  // D2: the platform floor is an absolute 4.0 (IELTS-standard base) — every
  // invalid/insufficient class caps AT the floor. The content_assessment
  // classification is kept for feedback + the re-record prompt, but no score
  // below 4.0 exists anywhere in the domain.
  let cap: number | null = null;

  if (isEmptyOrNoise) {
    cap                       = BAND_MIN;
    evaluation.needs_retry    = true;  // tell the controller to prompt a re-record
  } else if (isMurmurOnly || isOffTopic || isTooShort) {
    cap = BAND_MIN;
  }

  if (cap !== null) {
    evaluation.fluencyScore       = Math.min(evaluation.fluencyScore       ?? cap, cap);
    evaluation.vocabularyScore    = Math.min(evaluation.vocabularyScore    ?? cap, cap);
    evaluation.grammarScore       = Math.min(evaluation.grammarScore       ?? cap, cap);
    evaluation.pronunciationScore = Math.min(evaluation.pronunciationScore ?? cap, cap);
  }

  // Always clamp every criterion into [4,9] and recalculate bandScore — the
  // prompt instructs 4.0–9.0 but the model is not trusted to stay in range.
  evaluation.fluencyScore       = toBand(Number(evaluation.fluencyScore));
  evaluation.vocabularyScore    = toBand(Number(evaluation.vocabularyScore));
  evaluation.grammarScore       = toBand(Number(evaluation.grammarScore));
  evaluation.pronunciationScore = toBand(Number(evaluation.pronunciationScore));

  const criteria = [
    evaluation.fluencyScore,
    evaluation.vocabularyScore,
    evaluation.grammarScore,
    evaluation.pronunciationScore,
  ];
  evaluation.bandScore = toBand(criteria.reduce((a, b) => a + b, 0) / 4);

  return evaluation;
}

/** Standard "no speech" response — returned without calling Gemini. */
function emptyAudioResponse(reason: string) {
  return {
    bandScore:          BAND_MIN,
    fluencyScore:       BAND_MIN,
    vocabularyScore:    BAND_MIN,
    grammarScore:       BAND_MIN,
    pronunciationScore: BAND_MIN,
    transcript:         '',
    content_assessment: 'empty',
    needs_retry:        true,
    feedback: {
      fluency:      { score_rationale: reason, observed_issues: ['No audible speech detected.'], next_step: 'Ensure your microphone is working, speak clearly into it, and try again.' },
      vocabulary:   { score_rationale: reason, observed_issues: ['No vocabulary to evaluate.'],  next_step: 'Record your answer again, speaking at a natural volume.' },
      grammar:      { score_rationale: reason, observed_issues: ['No speech to evaluate.'],      next_step: 'Speak your complete answer and re-submit.' },
      pronunciation:{ score_rationale: reason, observed_issues: ['No pronunciation to assess.'], next_step: 'Make sure to speak clearly and at a normal pace.' },
      filler_words_detected: [],
      priority_action: 'Your recording could not be evaluated. Please re-record with your microphone active and speak your answer clearly.',
    },
  };
}

export async function analyzeSpeaking(
  topic:         string,
  audioFilePath: string,
  mimeType:      string = 'audio/webm'
) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');

  // ── Layer 1: File-size pre-flight ─────────────────────────────────────────
  // A WebM container with no meaningful audio is typically ≤ 5 KB.
  // Skip the API call entirely for obviously empty files.
  const fileSizeBytes = fs.statSync(audioFilePath).size;
  if (fileSizeBytes < 5_120) {  // < 5 KB
    console.warn(`[analyzeSpeaking] File too small (${fileSizeBytes} B) — treating as empty audio.`);
    return emptyAudioResponse('Audio file is too small to contain any meaningful speech.');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0 } });

  // ── Layer 2: Prompt with mandatory content_assessment field ───────────────
  // This forces Gemini to explicitly classify content BEFORE scoring.
  // The post-processing layer then enforces hard score caps regardless of what
  // Gemini outputs in the numeric fields.
  const prompt = `
You are a strict IELTS Speaking examiner. Your first task is to assess the audio content.

Topic the student was given: "${topic}"

STEP 1 — CONTENT CLASSIFICATION (mandatory):
Listen to the audio carefully and classify it as exactly ONE of:
  - "empty"       : No speech at all, pure silence, or just background noise
  - "noise_only"  : Only background noise, static, or clicking with no voice
  - "inaudible"   : A voice is present but completely unintelligible
  - "murmur_only" : Only filler sounds (um, uh, hmm) or single words with no sentences
  - "off_topic"   : Audible speech but clearly unrelated to the given topic
  - "too_short"   : Fewer than ~15 meaningful words of relevant content
  - "adequate"    : Enough content to evaluate properly

Set "content_assessment" to EXACTLY one of these values.

STEP 2 — SCORING RULES:
The platform band scale runs from 4.0 (absolute minimum) to 9.0 (maximum). No score below 4.0 exists.
- If content_assessment is "empty", "noise_only", or "inaudible":
  → Set ALL scores to the minimum 4.0. Transcript = "". Do not attempt to fabricate content.
- If content_assessment is "murmur_only", "off_topic", or "too_short":
  → Set ALL scores to the minimum 4.0. These do not demonstrate evaluable task performance.
- Only if content_assessment is "adequate":
  → Score normally on the 0.5-increment scale from 4.0 to 9.0.
  → Do NOT give any criterion above 6.5 unless clearly warranted.

IMPORTANT: Do NOT fabricate or imagine speech content that is not actually in the audio.
If you cannot clearly hear speech, classify accordingly and assign the minimum 4.0.

CRITERION DESCRIPTORS (for "adequate" responses only):

FLUENCY AND COHERENCE:
9.0: Speaks at length effortlessly. Coherent, appropriately fluent.
7.0: Talks at length with minimal effort. Self-correction effective.
6.0: Willing to speak at length but loses coherence at times.
5.0: Usually maintains flow but uses repetition. Over-dependence on fillers.
4.0: Cannot respond without noticeable pauses. Limited ability to link ideas.

LEXICAL RESOURCE:
9.0: Full flexibility and precision. Rare minor errors.
7.0: Flexibility. Awareness of style. Occasional inaccuracies.
6.0: Sufficient for the task. Errors don't impede communication.
5.0: Limited range. Errors in unfamiliar topics.
4.0: Basic vocabulary only. Frequent inappropriate choices.

GRAMMATICAL RANGE AND ACCURACY:
9.0: Full range, naturally and accurately used.
7.0: Range of complex structures. Frequent error-free sentences.
6.0: Mix of simple and complex. Meaning clear despite errors.
5.0: Basic forms with reasonable accuracy. Frequent errors in complexity.
4.0: Basic sentence forms only. Errors predominate.

PRONUNCIATION:
9.0: Full range with precision. Accent irrelevant to intelligibility.
7.0: All positive features with occasional lapses.
6.0: Mixed control. Generally understood. L1 influence present.
5.0: Inconsistent features. Some difficulty for listener.
4.0: Limited features. Can cause difficulty.

FEEDBACK RULES:
- Cite SPECIFIC evidence from the transcript. Never use generic praise.
- "next_step" = one practisable technique, not general advice.
- "filler_words_detected" = list actual filler words with frequency counts.
- "transcript" = verbatim, including all fillers and false starts.

Return ONLY valid JSON — no markdown, no code fences, no preamble:

{
  "content_assessment": "empty|noise_only|inaudible|murmur_only|off_topic|too_short|adequate",
  "bandScore": number,
  "fluencyScore": number,
  "vocabularyScore": number,
  "grammarScore": number,
  "pronunciationScore": number,
  "transcript": "verbatim string or empty string",
  "feedback": {
    "fluency": {
      "score_rationale": "One sentence with specific evidence",
      "observed_issues": ["issue 1", "issue 2"],
      "next_step": "One specific technique"
    },
    "vocabulary": {
      "score_rationale": "One sentence with specific evidence",
      "observed_issues": ["issue 1"],
      "strengths": ["strength if any"],
      "next_step": "One specific technique"
    },
    "grammar": {
      "score_rationale": "One sentence with specific evidence",
      "error_examples": ["exact error from transcript and correction"],
      "next_step": "One specific technique"
    },
    "pronunciation": {
      "score_rationale": "One sentence with specific evidence",
      "observed_issues": ["specific sound/pattern issue"],
      "next_step": "One specific technique"
    },
    "filler_words_detected": ["um — N times"],
    "priority_action": "The single most impactful improvement"
  }
}
`;

  try {
    const audioData = fs.readFileSync(audioFilePath);

    const result = await model.generateContent([
      { inlineData: { mimeType, data: audioData.toString('base64') } },
      { text: prompt }
    ]);

    let rawText = result.response.text().trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    // Gemini sometimes appends explanatory text after the JSON object.
    // Extract only the first complete JSON object to avoid parse errors.
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[analyzeSpeaking] No JSON found in response:', rawText.slice(0, 300));
      throw new Error('No JSON object found in AI response.');
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // ── Layer 3: Hard score enforcement ──────────────────────────────────────
    // Regardless of what Gemini returned in the numeric fields, apply our
    // deterministic caps based on content_assessment and transcript length.
    return enforceScores(evaluation);

  } catch (error: any) {
    console.error('[analyzeSpeaking] Error:', error);
    throw new Error('Failed to analyze speaking with AI.');
  }
}
