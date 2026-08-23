import { GoogleGenerativeAI } from '@google/generative-ai';
import { toBand } from '../lib/bandScale';
import { scoreComponentFromSubskills } from '../exam-engine';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function analyzeWriting(topic: string, content: string, taskType: "Task 1" | "Task 2" = "Task 1") {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0 } });

  const wordCount = content.trim().split(/\s+/).length;

  const prompt = `
You are a strict IELTS Writing examiner conducting an official band assessment.
You do not inflate scores to encourage students. Your job is accuracy, 
not encouragement. A student who receives an inflated score will fail 
their real exam — that is the harm you must prevent.

Task type: "${taskType}" (either "Task 1" or "Task 2")
Topic: "${topic}"

Student response:
"""
${content}
"""

Word count: ${wordCount} words.

SCORING RULES:
- The platform band scale runs from 4.0 (absolute minimum) to 9.0 (maximum). No score below 4.0 exists.
- TRIVIAL RESPONSE PENALTY: If the word count is extremely low (e.g., under 30 words), or consists of random words/characters without full sentences, you MUST assign the minimum score of 4.0 to ALL criteria. You cannot properly evaluate a full essay based on a few words.
- STRICT RELEVANCE PENALTY: The essay MUST be specifically about the provided Topic. If the content is out of context, addresses a random topic, or uses a memorized template that ignores the specific prompt asked, you MUST cap the Task Achievement/Response and Lexical Resource scores at the minimum of 4.0. You must strictly penalize essays that don't answer the specific question.
- Score each criterion on the 0.5-increment scale from 4.0 to 9.0.
- If word count is below 150 (Task 1) or 250 (Task 2) but is a genuine attempt, the
  Task Achievement/Response score cannot exceed 5.0.
- Do not give any criterion above 6.5 unless the performance is
  clearly strong across every observable marker for that band.
- The overall bandScore is the MEAN of the 4 criteria, rounded to
  the nearest 0.5.

CRITERION DESCRIPTORS:

TASK ACHIEVEMENT (Task 1) / TASK RESPONSE (Task 2):
9.0: Fully satisfies all requirements. Sufficiently developed position 
     with fully extended and well-supported ideas.
7.0: Addresses all parts of the task. Presents a clear position 
     throughout. Main ideas are extended and supported but 
     balance of coverage may be uneven.
6.0: Addresses all parts of the task though some more fully than 
     others. Presents a relevant position but conclusions may be 
     unclear or repetitive. Main ideas are extended but not all 
     are supported.
5.0: Addresses the task only partially. Format may be inappropriate. 
     Position is expressed but difficult to identify. Some main 
     ideas are present but lack development.
4.0: Responds to task but fails to address it adequately. Format 
     may be inappropriate. A position is present but not clear. 
     Ideas are repetitive or mechanical.

COHERENCE AND COHESION:
9.0: Sequences information seamlessly. Manages all aspects of cohesion 
     skilfully. Paragraphing is used appropriately throughout.
7.0: Logically organises information with clear overall progression. 
     Uses a range of cohesive devices appropriately although there 
     may be some over- or under-use.
6.0: Arranges information coherently with clear overall progression. 
     Uses cohesive devices effectively but over- or under-uses some 
     features. Uses paragraphing but not always logically.
5.0: Presents information with some organisation but lacks overall 
     progression. Uses limited range of cohesive devices. May not 
     write in paragraphs or may not paragraph appropriately.
4.0: Presents information but lacks overall progression. Uses a 
     limited range of cohesive devices and those used may not 
     indicate a logical relationship between ideas.

LEXICAL RESOURCE:
9.0: Uses a wide range of vocabulary with sophisticated control. 
     Errors are rare and minor.
7.0: Uses a sufficient range of vocabulary to allow flexibility and 
     precision. Uses less common lexical items with some awareness 
     of style. Minor errors in spelling and word formation.
6.0: Uses an adequate range of vocabulary for the task. Attempts to 
     use less common vocabulary but with some inaccuracy. Makes 
     some errors in spelling and word formation but meaning is clear.
5.0: Uses a limited range of vocabulary but this is minimally 
     adequate for the task. May make noticeable errors in 
     spelling and word formation that cause difficulty for the reader.
4.0: Uses only basic vocabulary which is inadequate or may be 
     inappropriately used. Errors in spelling and word formation 
     may cause strain for the reader.

GRAMMATICAL RANGE AND ACCURACY:
9.0: Uses a wide range of structures with full flexibility and 
     accuracy. Rare minor errors.
7.0: Uses a variety of complex structures. Produces frequent 
     error-free sentences. Has good control of grammar and 
     punctuation but may make a few errors.
6.0: Uses a mix of simple and complex sentence forms. Makes some 
     errors in grammar and punctuation but rarely impedes communication.
5.0: Uses only a limited range of structures. Attempts complex 
     sentences but these tend to be less accurate. May make frequent 
     grammatical errors and punctuation may be faulty.
4.0: Uses only a very limited range of structures with only rare 
     use of subordinate clauses. Some structures are accurate but 
     errors predominate and punctuation is often faulty.

FEEDBACK RULES — critical:
- Every score_rationale must cite specific evidence from the essay. 
  Do not make claims that cannot be verified from the text.
- "error_examples" must quote exact text from the essay with 
  correction and explanation.
- "next_step" must be one specific, practisable technique — 
  not general advice like "read more."
- Do not praise effort. Assess only quality.

Return ONLY valid JSON with no markdown, no code fences, no preamble:

{
  "bandScore": number,
  "taskResponseScore": number,
  "coherenceScore": number,
  "vocabularyScore": number,
  "grammarScore": number,
  "feedback": {
    "task_response": {
      "score_rationale": "One sentence citing specific evidence from the essay for this score",
      "observed_issues": ["specific issue with quote from essay"],
      "next_step": "One specific technique to apply in the next writing session"
    },
    "coherence": {
      "score_rationale": "One sentence citing specific evidence for this score",
      "observed_issues": ["specific structural or cohesion issue"],
      "next_step": "One specific technique to apply in the next writing session"
    },
    "vocabulary": {
      "score_rationale": "One sentence citing specific evidence for this score",
      "error_examples": ["quote exact vocabulary error and explain it"],
      "strengths": ["quote specific strong vocabulary choice if present"],
      "next_step": "One specific technique to apply in the next writing session"
    },
    "grammar": {
      "score_rationale": "One sentence citing specific evidence for this score",
      "error_examples": ["quote exact grammatical error, provide correction, explain the rule"],
      "next_step": "One specific technique to apply in the next writing session"
    },
    "priority_action": "The single most impactful change this student should make before submitting their next essay"
  }
}
`;

  try {
    const result = await model.generateContent(prompt);
    let rawText = result.response.text().trim();

    // Strip markdown fences if present
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    // Gemini sometimes appends commentary after the JSON — extract just the object
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[analyzeWriting] No JSON found in response:', rawText.slice(0, 300));
      throw new Error('No JSON object found in AI response.');
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Validate the band score arithmetic yourself. Hard-clamp every criterion to
    // the [4,9] platform domain — the prompt instructs 4.0–9.0, but the model is
    // not trusted to stay in range (same reason speaking has enforceScores).
    evaluation.taskResponseScore = toBand(Number(evaluation.taskResponseScore));
    evaluation.coherenceScore    = toBand(Number(evaluation.coherenceScore));
    evaluation.vocabularyScore   = toBand(Number(evaluation.vocabularyScore));
    evaluation.grammarScore      = toBand(Number(evaluation.grammarScore));

    // Component band = mean of the 4 criteria, via the engine (band_mean on ielts_band).
    // Identical to the old toBand(mean); the rubric that produced the criteria is untouched.
    evaluation.bandScore = scoreComponentFromSubskills('ielts', 'writing', {
      task_response: evaluation.taskResponseScore,
      coherence_cohesion: evaluation.coherenceScore,
      lexical_resource: evaluation.vocabularyScore,
      grammatical_range_accuracy: evaluation.grammarScore,
    }).value;

    return evaluation;
  } catch (error: any) {
    console.error('Error in analyzeWriting:', error);
    throw new Error('Failed to analyze writing with AI.');
  }
}
