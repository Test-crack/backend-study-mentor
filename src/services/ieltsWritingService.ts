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

    Evaluate this essay strictly according to the official IELTS writing band descriptors (Task Achievement/Response, Coherence & Cohesion, Lexical Resource, Grammatical Range and Accuracy).
    
    You must return your evaluation strictly in the following JSON structure without any surrounding markdown blocks (just the raw JSON string):
    {
      "bandScore": "string",
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
