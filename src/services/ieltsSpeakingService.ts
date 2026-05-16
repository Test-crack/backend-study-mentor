import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';

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

  let cap: number | null = null;

  if (isEmptyOrNoise) {
    cap                       = 1.0;
    evaluation.needs_retry    = true;  // tell the controller to prompt a re-record
  } else if (isMurmurOnly) {
    cap = 1.5;
  } else if (isOffTopic) {
    cap = 2.0;
  } else if (isTooShort) {
    cap = 3.0;
  }

  if (cap !== null) {
    evaluation.fluencyScore       = Math.min(evaluation.fluencyScore       ?? cap, cap);
    evaluation.vocabularyScore    = Math.min(evaluation.vocabularyScore    ?? cap, cap);
    evaluation.grammarScore       = Math.min(evaluation.grammarScore       ?? cap, cap);
    evaluation.pronunciationScore = Math.min(evaluation.pronunciationScore ?? cap, cap);
  }

  // Always recalculate bandScore after any enforcement
  const criteria = [
    evaluation.fluencyScore,
    evaluation.vocabularyScore,
    evaluation.grammarScore,
    evaluation.pronunciationScore,
  ];
  evaluation.bandScore = Math.round((criteria.reduce((a, b) => a + b, 0) / 4) * 2) / 2;

  return evaluation;
}

/** Standard "no speech" response — returned without calling Gemini. */
function emptyAudioResponse(reason: string) {
  return {
    bandScore:          1.0,
    fluencyScore:       1.0,
    vocabularyScore:    1.0,
    grammarScore:       1.0,
    pronunciationScore: 1.0,
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

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
- If content_assessment is "empty", "noise_only", or "inaudible":
  → Set ALL scores to 1.0. Transcript = "". Do not attempt to fabricate content.
- If content_assessment is "murmur_only":
  → Set ALL scores to 1.0 or 1.5. These are not evaluable responses.
- If content_assessment is "off_topic":
  → Set ALL scores to a MAXIMUM of 2.0. The student did not address the task.
- If content_assessment is "too_short":
  → Set ALL scores to a MAXIMUM of 3.0.
- Only if content_assessment is "adequate":
  → Score normally on the 0.5-increment scale from 1.0 to 9.0.
  → Do NOT give any criterion above 6.5 unless clearly warranted.

IMPORTANT: Do NOT fabricate or imagine speech content that is not actually in the audio.
If you cannot clearly hear speech, classify accordingly and assign 1.0–2.0.

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

  const originalTlsState = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    const audioData = fs.readFileSync(audioFilePath);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const result = await model.generateContent([
      { inlineData: { mimeType, data: audioData.toString('base64') } },
      { text: prompt }
    ]);

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsState;

    let rawText = result.response.text().trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const evaluation = JSON.parse(rawText);

    // ── Layer 3: Hard score enforcement ──────────────────────────────────────
    // Regardless of what Gemini returned in the numeric fields, apply our
    // deterministic caps based on content_assessment and transcript length.
    return enforceScores(evaluation);

  } catch (error: any) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsState;
    console.error('[analyzeSpeaking] Error:', error);
    throw new Error('Failed to analyze speaking with AI.');
  }
}
