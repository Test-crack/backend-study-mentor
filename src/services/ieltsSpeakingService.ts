import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function analyzeSpeaking(topic: string, audioFilePath: string, mimeType: string = 'audio/webm') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are a strict IELTS Speaking examiner conducting an official band assessment. 
You do not inflate scores to encourage students. Your job is accuracy, 
not encouragement. A student who receives an inflated score will fail 
their real exam — that is the harm you must prevent.

The student was responding to this prompt:
Topic: "${topic}"

SCORING RULES:
- TRIVIAL RESPONSE & MURMUR PENALTY: If the response is just random murmurs (e.g., "Uhm", "Hmm"), a single sentence, or extremely short, you MUST assign a score of 1.0 or 2.0 to ALL criteria. You cannot evaluate fluency, grammar, or vocabulary on a mere grunt or single phrase.
- STRICT RELEVANCE PENALTY: The answer MUST be specifically in context with the provided Topic. If the answer is entirely out of context, talks about a random different topic, or is just a pre-memorized unrelated speech, you MUST assign a maximum score of 2.0 for Fluency & Coherence, and Lexical Resource. You must penalize answers that don't address the specific question asked.
- Score each criterion on the 0.5-increment scale from 1.0 to 9.0.
- Do not give any criterion above 6.5 unless the performance is clearly 
  strong across every observable marker for that band.
- The overall bandScore is the MEAN of the 4 criteria, rounded to the 
  nearest 0.5 (not rounded down — rounded to nearest).

CRITERION DESCRIPTORS — use these to anchor every score:

FLUENCY AND COHERENCE:
9.0: Speaks at length effortlessly. Coherent, appropriately fluent, 
     accurate use of organisational features.
7.0: Able to talk at length without noticeable effort. Some hesitation 
     but self-correction is effective. Uses a range of connectives.
6.0: Willing to speak at length but loses coherence at times. Hesitation 
     present but does not impede communication overall.
5.0: Usually maintains flow but uses repetition and self-correction. 
     Over-dependence on fillers noticeable. Responses sometimes lack 
     relevance or are difficult to follow.
4.0: Cannot respond without noticeable pauses. Limited ability to link 
     ideas. Speech is slow with frequent repetition.

LEXICAL RESOURCE:
9.0: Uses vocabulary with full flexibility and precision. Rare minor 
     errors in word choice or collocation.
7.0: Uses vocabulary with flexibility. Some awareness of style and 
     collocation. Occasional inaccuracies in word choice.
6.0: Uses vocabulary sufficiently for the task. Errors in word choice 
     do not impede communication. Uses some less common vocabulary.
5.0: Manages to communicate in familiar topics but uses limited range. 
     Makes errors in less familiar topics. Uses paraphrase inadequately.
4.0: Basic vocabulary only. Frequent inappropriate choices impede 
     meaning. Limited range for unfamiliar topics.

GRAMMATICAL RANGE AND ACCURACY:
9.0: Uses a full range of structures naturally and accurately. 
     Rare minor errors.
7.0: Uses a range of complex structures with some flexibility. 
     Frequent error-free sentences. Some errors in complex structures.
6.0: Mix of simple and complex structures. Limited range of complex 
     forms. Some errors in complex structures but meaning is clear.
5.0: Produces basic sentence forms with reasonable accuracy. Limited 
     range of complex structures. Frequent errors in complex structures.
4.0: Produces basic sentence forms. Subordinate clauses rare and often 
     faulty. Some structures are accurate but errors are frequent.

PRONUNCIATION:
9.0: Uses full range of pronunciation features with precision and 
     subtlety. Accent does not affect intelligibility.
7.0: Shows all positive features with occasional lapses. Easy to 
     understand throughout. L1 accent has minimal effect.
6.0: Uses a range of pronunciation features with mixed control. 
     Can generally be understood throughout. L1 influence present.
5.0: Shows some features of 6.0 and some of 4.0. 
     Attempts to use a range of features with inconsistent success.
4.0: Uses a limited range of pronunciation features. Attempts some 
     features of connected speech but these are often inaccurate. 
     Can cause some difficulty for the listener.

FEEDBACK RULES — this is critical:
- Every feedback point must state BOTH what was observed AND why it 
  affected the score. Generic statements like "good vocabulary" are 
  not acceptable.
- The "next_step" for each criterion must be one specific, practisable 
  technique — not general advice.
- "filler_words_detected" must list the actual filler words heard and 
  how frequently (e.g., "um — 8 times, you know — 4 times"). 
  If none detected, return empty array.
- Transcript must be verbatim — include all fillers, false starts, 
  and incomplete words.

Return ONLY valid JSON with no markdown, no code fences, no preamble:

{
  "bandScore": number,
  "fluencyScore": number,
  "vocabularyScore": number,
  "grammarScore": number,
  "pronunciationScore": number,
  "transcript": "verbatim string including all fillers and false starts",
  "feedback": {
    "fluency": {
      "score_rationale": "One sentence explaining exactly why this score was given, not higher, not lower",
      "observed_issues": ["specific observation 1", "specific observation 2"],
      "next_step": "One specific technique to practice this week"
    },
    "vocabulary": {
      "score_rationale": "One sentence explaining exactly why this score was given",
      "observed_issues": ["specific observation 1"],
      "strengths": ["specific strength if any"],
      "next_step": "One specific technique to practice this week"
    },
    "grammar": {
      "score_rationale": "One sentence explaining exactly why this score was given",
      "error_examples": ["quote exact error from transcript and explain it"],
      "next_step": "One specific technique to practice this week"
    },
    "pronunciation": {
      "score_rationale": "One sentence explaining exactly why this score was given",
      "observed_issues": ["specific sound or pattern issue"],
      "next_step": "One specific technique to practice this week"
    },
    "filler_words_detected": ["list each filler word with frequency count"],
    "priority_action": "The single most impactful thing this student should fix before their next practice session"
  }
}
`;

  try {
    const audioData = fs.readFileSync(audioFilePath);
    
    // Temporarily bypass strict TLS for local developer proxies
    const originalTlsState = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: audioData.toString('base64'),
        },
      },
      { text: prompt }
    ]);

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsState;

    let rawText = result.response.text().trim();
    
    // Strip markdown fences if present
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const evaluation = JSON.parse(rawText);

    // Validate the band score arithmetic yourself
    const criteria = [
      evaluation.fluencyScore,
      evaluation.vocabularyScore, 
      evaluation.grammarScore,
      evaluation.pronunciationScore
    ];
    const avg = criteria.reduce((a, b) => a + b, 0) / criteria.length;
    evaluation.bandScore = Math.round(avg * 2) / 2; // round to nearest 0.5

    return evaluation;
  } catch (error: any) {
    console.error('Error in analyzeSpeaking:', error);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    throw new Error('Failed to analyze speaking with AI.');
  }
}
