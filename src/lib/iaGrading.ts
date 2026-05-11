import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI          = new GoogleGenerativeAI(GEMINI_API_KEY);

export type IAGradeResult = {
    band:             number;
    rationale:        string;
    key_observations: string[];
};

// ── Per-criterion display names ───────────────────────────────────────────────

const WRITING_CRITERION: Record<string, string> = {
    GRAMMAR:       'Grammatical Range and Accuracy',
    VOCABULARY:    'Lexical Resource',
    COHERENCE:     'Coherence and Cohesion',
    TASK_RESPONSE: 'Task Achievement / Task Response',
};

const SPEAKING_CRITERION: Record<string, string> = {
    GRAMMAR:       'Grammatical Range and Accuracy',
    VOCABULARY:    'Lexical Resource',
    FLUENCY:       'Fluency and Coherence',
    PRONUNCIATION: 'Pronunciation',
};

// ── Band descriptors (1-10 scale, IELTS-aligned) ──────────────────────────────

const DESCRIPTORS: Record<string, string> = {
    GRAMMAR: `
Band 10 — Flawless grammatical control. Wide range of complex structures used naturally and accurately. Zero errors.
Band 9 — Near-perfect grammar. Sophisticated structures with rare, minor slips that don't affect meaning.
Band 8 — Strong grammatical range. Complex sentences handled well. Occasional errors in advanced structures.
Band 7 — Good variety of structures. Mix of simple and complex forms. Some errors but meaning always clear.
Band 6 — Adequate grammar. Mostly simple sentences with attempts at complexity. Errors present but communication maintained.
Band 5 — Limited grammatical range. Frequent errors in complex forms. Simple structures mostly accurate.
Band 4 — Basic grammar only. Errors common even in simple structures. Meaning sometimes unclear.
Band 3 — Very limited grammar. Errors predominate. Struggles with basic sentence formation.
Band 2 — Minimal grammatical control. Fragmented sentences. Errors severely impede understanding.
Band 1 — No meaningful grammatical structure. Random words or single-word responses.`,

    VOCABULARY: `
Band 10 — Exceptional lexical resource. Sophisticated, precise, and contextually perfect word choices throughout.
Band 9 — Wide-ranging vocabulary with natural collocations. Rare minor errors in word choice or spelling.
Band 8 — Strong vocabulary range. Effective use of less common items. Minor inaccuracies don't impede meaning.
Band 7 — Good vocabulary range with some flexibility. Attempts sophisticated words with occasional imprecision.
Band 6 — Adequate vocabulary for the task. Some less common words used. Meaning generally clear despite errors.
Band 5 — Limited vocabulary. Relies on basic words. Noticeable errors in word choice and spelling.
Band 4 — Very limited vocabulary. Repetitive and basic. Frequent inappropriate word choices.
Band 3 — Minimal vocabulary. Struggles to express basic ideas. Heavy reliance on simple words.
Band 2 — Extremely limited vocabulary. Random or inappropriate word use. Barely conveys meaning.
Band 1 — No meaningful vocabulary. Single words or nonsensical text.`,

    COHERENCE: `
Band 10 — Perfectly organized and cohesive. Ideas flow seamlessly with sophisticated linking devices.
Band 9 — Excellent organization. Clear progression throughout. Skillful use of cohesive devices.
Band 8 — Well-organized with logical flow. Good range of cohesive devices used appropriately.
Band 7 — Clear organization with logical progression. Some variety in cohesive devices.
Band 6 — Generally coherent with overall progression. Some over/under-use of linking words.
Band 5 — Basic organization present. Limited range of cohesive devices. Some unclear connections.
Band 4 — Poor organization. Ideas disconnected. Minimal use of linking devices.
Band 3 — Very poor organization. No clear progression. Ideas jumbled.
Band 2 — Incoherent. Random thoughts with no logical connection.
Band 1 — No coherent structure. Incomprehensible organization.`,

    TASK_RESPONSE: `
Band 10 — Fully addresses all aspects of the task with depth and sophistication. Ideas fully extended and well-supported.
Band 9 — Comprehensively addresses the task. All parts covered with well-developed, relevant ideas.
Band 8 — Addresses all parts of the task well. Ideas are relevant and supported, though some may be more developed than others.
Band 7 — Addresses the task with clear position. Main ideas present and extended, though development may be uneven.
Band 6 — Addresses the task but some parts more fully than others. Position may be unclear at times.
Band 5 — Addresses the task only partially. Ideas present but underdeveloped or tangential.
Band 4 — Minimal task response. Ideas barely relevant or repetitive. Misses key aspects.
Band 3 — Poor task response. Mostly irrelevant content. Fails to address the prompt adequately.
Band 2 — Barely responds to task. Content largely irrelevant or off-topic.
Band 1 — No meaningful response to the task. Completely irrelevant or nonsensical.`,

    FLUENCY: `
Band 10 — Effortlessly fluent. Speaks at length with natural rhythm and no hesitation. Perfect coherence.
Band 9 — Highly fluent. Speaks easily at length with minimal hesitation. Self-corrects smoothly.
Band 8 — Fluent speech with occasional hesitation. Maintains flow well. Good self-correction.
Band 7 — Generally fluent with some hesitation. Can speak at length but may lose coherence occasionally.
Band 6 — Willing to speak but with noticeable hesitation. Uses fillers but maintains basic flow.
Band 5 — Frequent hesitation and pauses. Over-reliance on fillers. Struggles to maintain flow.
Band 4 — Slow, hesitant speech. Long pauses. Difficulty linking ideas. Very limited flow.
Band 3 — Very slow and fragmented. Constant pauses. Cannot maintain any flow.
Band 2 — Minimal speech. Long silences. Single words or short phrases only.
Band 1 — Cannot produce connected speech. Single words or grunts only.`,

    PRONUNCIATION: `
Band 10 — Perfect pronunciation. All features of connected speech used naturally. Fully intelligible.
Band 9 — Excellent pronunciation. Full range of features with rare lapses. Accent doesn't affect clarity.
Band 8 — Strong pronunciation. Good control of features. Occasional L1 influence but always clear.
Band 7 — Good pronunciation. Generally easy to understand. Some L1 features present.
Band 6 — Adequate pronunciation. Generally intelligible despite L1 influence. Some strain for listener.
Band 5 — Limited pronunciation control. Frequent L1 interference. Requires effort to understand.
Band 4 — Poor pronunciation. Heavy L1 accent. Difficult to understand at times.
Band 3 — Very poor pronunciation. Severely affects intelligibility. Hard to follow.
Band 2 — Barely intelligible. Pronunciation severely impedes communication.
Band 1 — Unintelligible. Cannot be understood.`,
};

// ── Shared Gemini call ────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<IAGradeResult> {
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    let   raw    = result.response.text().trim();
    
    // Remove markdown code fences if present
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    const parsed = JSON.parse(raw);
    
    // Allow 0.5-increment values (e.g. 6.5) so submitIA can produce proper IELTS half-bands
    let band = Number(parsed.band);
    band = Math.round(band * 2) / 2;       // round to nearest 0.5
    band = Math.min(10, Math.max(1, band)); // clamp to 1–10
    
    parsed.band = band;
    
    // Ensure required fields exist
    if (!parsed.rationale) parsed.rationale = 'No rationale provided.';
    if (!Array.isArray(parsed.key_observations)) parsed.key_observations = [];
    
    return parsed as IAGradeResult;
}

function buildPrompt(
    type:           'writing' | 'speaking',
    subSkill:       string,
    questionPrompt: string,
    response:       string,
    wordCount:      number,
): string {
    const mode       = type === 'writing' ? 'WRITTEN response' : 'SPOKEN response (from transcript)';
    const criterion  = type === 'writing'
        ? (WRITING_CRITERION[subSkill]  ?? subSkill)
        : (SPEAKING_CRITERION[subSkill] ?? subSkill);
    const descriptors  = DESCRIPTORS[subSkill] ?? '';
    const minWords     = type === 'writing' ? 30 : 20;
    const idealWords   = type === 'writing' ? 80 : 50;

    return `You are an expert IELTS Internal Assessment grader with years of experience evaluating student responses.

YOUR TASK: Grade the "${criterion}" criterion of this student's ${mode} on a scale of 1-10.

═══════════════════════════════════════════════════════════════════════════════
QUESTION PROMPT:
"${questionPrompt}"

STUDENT RESPONSE:
"""
${response}
"""

Word Count: ${wordCount} words
═══════════════════════════════════════════════════════════════════════════════

GRADING SCALE (1-10) FOR "${criterion}":
${descriptors}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL EVALUATION CRITERIA:

1. RELEVANCE TO QUESTION (Primary Factor):
   - Does the response directly address the question prompt?
   - Is the content contextually appropriate and on-topic?
   - Off-topic or irrelevant responses: Maximum band 3, regardless of language quality
   - Partially relevant responses: Cap at band 5-6
   - Fully relevant responses: Eligible for bands 7-10 based on quality

2. RESPONSE LENGTH (Secondary Factor):
   - Less than ${minWords} words: Maximum band 4 (insufficient content to demonstrate skill)
   - ${minWords}-${idealWords} words: Eligible for bands 5-8 based on quality
   - More than ${idealWords} words: Eligible for full range (1-10) based on quality
   - Single words, grunts, or trivial responses: Band 1-2

3. ${criterion.toUpperCase()} QUALITY (Core Assessment):
   - Evaluate the specific criterion based on the descriptors above
   - Consider the student's demonstration of the skill in context
   - Look for concrete evidence in the response text
   ${type === 'speaking' ? '- This is a TRANSCRIPT: Natural speech patterns expected; don\'t penalize for missing punctuation' : '- Assess written conventions: spelling, punctuation, formatting'}

4. HOLISTIC IELTS STANDARDS:
   - Be strict but fair — this is an official assessment
   - Never inflate scores without clear evidence
   - Consider the student's level: beginners vs. advanced learners
   - A "good" response at beginner level may still be band 5-6
   - Reserve bands 8-10 for truly exceptional work

═══════════════════════════════════════════════════════════════════════════════
GRADING INSTRUCTIONS:

Step 1: Check relevance — Does this answer the question asked?
Step 2: Check length — Is there enough content to fairly assess the skill?
Step 3: Evaluate the "${criterion}" criterion using the band descriptors
Step 4: Assign a band from 1-10 (whole numbers only, no decimals)
Step 5: Write a clear rationale citing specific evidence from the response
Step 6: List 2-3 key observations (strengths or weaknesses)

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT:

Return ONLY valid JSON with NO markdown, NO code fences, NO extra text:

{
  "band": <integer 1-10>,
  "rationale": "<2-3 sentences explaining the band score with specific evidence from the response>",
  "key_observations": [
    "<specific observation 1 with example from text>",
    "<specific observation 2 with example from text>",
    "<specific observation 3 with example from text>"
  ]
}

IMPORTANT: 
- Band must be an integer from 1 to 10
- Rationale must cite specific examples from the student's response
- Key observations must be concrete and evidence-based
- Be consistent with IELTS standards — strict but fair`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gradeIAWritingPrompt(
    subSkill:       string,
    questionPrompt: string,
    response:       string,
): Promise<IAGradeResult> {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
    if (!response?.trim()) {
        return { 
            band: 1, 
            rationale: 'No response provided. Cannot assess the criterion without student input.', 
            key_observations: ['Student submitted no text', 'Unable to evaluate any aspect of the criterion', 'Automatic minimum score assigned'] 
        };
    }
    const wc = response.trim().split(/\s+/).filter(Boolean).length;
    try {
        return await callGemini(buildPrompt('writing', subSkill, questionPrompt, response, wc));
    } catch (e) {
        console.error('[IAGrading] writing grading failed:', e);
        return { 
            band: 1, 
            rationale: 'AI grading system encountered an error. Minimum score assigned for safety.', 
            key_observations: ['Technical error during grading', 'Response could not be evaluated', 'Please contact support if this persists'] 
        };
    }
}

export async function gradeIASpeakingPrompt(
    subSkill:       string,
    questionPrompt: string,
    transcript:     string,
): Promise<IAGradeResult> {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
    if (!transcript?.trim()) {
        return { 
            band: 1, 
            rationale: 'No transcript provided. Cannot assess speaking without recorded speech.', 
            key_observations: ['No speech was recorded for this question', 'Unable to evaluate any aspect of the criterion', 'Automatic minimum score assigned'] 
        };
    }
    const wc = transcript.trim().split(/\s+/).filter(Boolean).length;
    try {
        return await callGemini(buildPrompt('speaking', subSkill, questionPrompt, transcript, wc));
    } catch (e) {
        console.error('[IAGrading] speaking grading failed:', e);
        return { 
            band: 1, 
            rationale: 'AI grading system encountered an error. Minimum score assigned for safety.', 
            key_observations: ['Technical error during grading', 'Transcript could not be evaluated', 'Please contact support if this persists'] 
        };
    }
}
