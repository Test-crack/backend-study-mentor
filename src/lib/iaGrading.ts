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

// ── Band descriptors (shared where possible) ──────────────────────────────────

const DESCRIPTORS: Record<string, string> = {
    GRAMMAR: `
Band 9 — Wide range of structures with full flexibility and accuracy. Rare minor errors.
Band 7 — Variety of complex structures. Frequent error-free sentences. Good control overall.
Band 6 — Mix of simple and complex forms. Some errors but rarely impede communication.
Band 5 — Limited structures. Attempts complex forms with less accuracy. Frequent errors.
Band 4 — Very limited range. Some accurate structures but errors predominate.`,

    VOCABULARY: `
Band 9 — Wide range with sophisticated control. Errors are rare and minor.
Band 7 — Sufficient range for flexibility and precision. Minor errors in word form or spelling.
Band 6 — Adequate range. Attempts less common items with some inaccuracy. Meaning clear.
Band 5 — Limited but minimally adequate. Noticeable errors in spelling / word formation.
Band 4 — Basic vocabulary only; often inappropriate choices. Errors cause strain for reader.`,

    COHERENCE: `
Band 9 — Sequences information seamlessly. All aspects of cohesion managed skilfully.
Band 7 — Logically organised with clear overall progression. Range of cohesive devices.
Band 6 — Coherent with overall progression. Some over- or under-use of devices.
Band 5 — Some organisation but lacks overall progression. Limited cohesive devices.
Band 4 — Lacks overall progression. Limited devices; no clear logical relationship between ideas.`,

    TASK_RESPONSE: `
Band 9 — Fully satisfies all requirements. Fully extended and well-supported ideas.
Band 7 — Addresses all parts. Clear position throughout. Main ideas extended but may be uneven.
Band 6 — Addresses all parts though some incompletely. Position may be unclear.
Band 5 — Addresses task only partially. Ideas present but lack development.
Band 4 — Responds to task but inadequately. Ideas repetitive or mechanical.`,

    FLUENCY: `
Band 9 — Speaks at length effortlessly. Coherent and appropriately fluent throughout.
Band 7 — Talks at length without noticeable effort. Some hesitation; self-corrects effectively.
Band 6 — Willing to speak at length but loses coherence at times. Hesitation manageable.
Band 5 — Usually maintains flow but uses repetition. Over-dependence on fillers.
Band 4 — Cannot respond without noticeable pauses. Limited ability to link ideas. Speech slow.`,

    PRONUNCIATION: `
Band 9 — Full range of pronunciation features with precision. Accent does not affect intelligibility.
Band 7 — All positive features with occasional lapses. Easy to understand throughout.
Band 6 — Range of features with mixed control. Generally understood. L1 influence present.
Band 5 — Inconsistent success with pronunciation features. Patchy range.
Band 4 — Limited range. Attempts some features of connected speech with poor accuracy.`,
};

// ── Shared Gemini call ────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<IAGradeResult> {
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    let   raw    = result.response.text().trim();
    if   (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(raw);
    parsed.band  = Math.min(9.0, Math.max(0.0, Math.round(Number(parsed.band) * 2) / 2));
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
    const trivialLimit = type === 'writing' ? 15 : 10;

    return `You are a strict IELTS Internal Assessment grader.
Your ONLY task: evaluate the "${criterion}" criterion of the student's ${mode}.
Do NOT score any other IELTS criterion.

Prompt given to the student: "${questionPrompt}"

Student response:
"""
${response}
"""
Word count: ${wordCount}

BAND DESCRIPTORS — "${criterion}":
${descriptors}

RULES:
- Trivial response (< ${trivialLimit} words, random text, single word/grunt): assign band 1.0–2.0.
- Irrelevant response (does not address the prompt at all): cap band at 3.0.
- Score in 0.5 increments from 1.0 to 9.0.
- Never inflate. Cite exact evidence from the response text.
${type === 'speaking' ? '- This is a TRANSCRIPT — assume natural speech rhythm; do not penalise for absent punctuation.' : ''}

Return ONLY valid JSON, no markdown, no code fences, no extra keys:
{"band":<number>,"rationale":"<one sentence citing direct evidence>","key_observations":["<obs1>","<obs2>"]}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gradeIAWritingPrompt(
    subSkill:       string,
    questionPrompt: string,
    response:       string,
): Promise<IAGradeResult> {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
    if (!response?.trim()) return { band: 0, rationale: 'No response provided.', key_observations: ['Student submitted no text.'] };
    const wc = response.trim().split(/\s+/).filter(Boolean).length;
    try {
        return await callGemini(buildPrompt('writing', subSkill, questionPrompt, response, wc));
    } catch (e) {
        console.error('[IAGrading] writing grading failed:', e);
        return { band: 0, rationale: 'AI grading failed — scored as 0.', key_observations: [] };
    }
}

export async function gradeIASpeakingPrompt(
    subSkill:       string,
    questionPrompt: string,
    transcript:     string,
): Promise<IAGradeResult> {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
    if (!transcript?.trim()) return { band: 0, rationale: 'No transcript provided.', key_observations: ['No speech was recorded for this question.'] };
    const wc = transcript.trim().split(/\s+/).filter(Boolean).length;
    try {
        return await callGemini(buildPrompt('speaking', subSkill, questionPrompt, transcript, wc));
    } catch (e) {
        console.error('[IAGrading] speaking grading failed:', e);
        return { band: 0, rationale: 'AI grading failed — scored as 0.', key_observations: [] };
    }
}
