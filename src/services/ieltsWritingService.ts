import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function analyzeWriting(topic: string, content: string) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
    You are an expert IELTS examiner. Analyze the following student essay based on this topic prompt:
    Topic: "${topic}"

    Student Essay:
    """
    ${content}
    """

    Evaluate this essay strictly according to the official IELTS writing band descriptors.
    Anchor your scoring explicitly against these IDP IELTS metrics:
    9: Expert User (Fully operational command)
    8: Very Good User (Fully operational command, occasional inaccuracies)
    7: Good User (Operational command, some inaccuracies)
    6: Competent User (Generally effective command, some inaccuracies)
    5: Modest User (Partial command, copes with general meaning)
    4: Limited User (Basic competence in familiar situations)
    3: Extremely Limited User (Conveys only general meaning)
    2: Intermittent User (Great difficulty understanding)
    1: Non-User (Cannot communicate)
    0: Did not attempt (Did not answer questions)

    Score each of the four criteria precisely from 4.0 to 9.0, limited to 0.5 increments (e.g., 6.0, 6.5, 7.0, etc.). 
    Do not give any metric below 4.0.
    1. Task Achievement / Task Response (taskResponseScore)
    2. Coherence & Cohesion (coherenceScore)
    3. Lexical Resource (vocabularyScore)
    4. Grammatical Range and Accuracy (grammarScore)
    
    You must calculate the overall 'bandScore' as the mathematical average of the 4 criteria, rounded down to the nearest 0.5.
    
    You must return your evaluation strictly in the following JSON structure without any surrounding markdown blocks or markdown formatting (e.g. no \`\`\`json):
    {
      "bandScore": number,
      "grammarScore": number,
      "vocabularyScore": number,
      "coherenceScore": number,
      "taskResponseScore": number,
      "detailedFeedback": {
        "grammar": ["string"],
        "vocabulary": ["string"],
        "improvements": "string"
      }
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    let output = result.response.text();

    // Clean up potential markdown wrapper from Gemini output
    if (output.startsWith('\`\`\`json')) {
      output = output.replace(/\`\`\`json\n/g, '').replace(/\`\`\`/g, '');
    } else if (output.startsWith('\`\`\`')) {
      output = output.replace(/\`\`\`\n/g, '').replace(/\`\`\`/g, '');
    }

    const parsedJson = JSON.parse(output.trim());
    return parsedJson;
  } catch (error: any) {
    console.error('Error in analyzeWriting:', error);
    throw new Error('Failed to analyze writing with AI.');
  }
}
