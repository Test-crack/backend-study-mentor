import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function analyzeSpeaking(topic: string, audioFilePath: string, mimeType: string = 'audio/webm') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `
    You are an expert IELTS Speaking examiner. 
    Analyze the attached spoken audio response based on the following prompt:
    Topic: "${topic}"

    Evaluate the spoken response strictly according to the official IELTS speaking band descriptors.
    Anchor your scoring explicitly against these criteria:
    9: Expert User (Fully operational command)
    8: Very Good User (Fully operational command, occasional inaccuracies)
    7: Good User (Operational command, some inaccuracies)
    6: Competent User (Generally effective command, some inaccuracies)
    5: Modest User (Partial command, copes with general meaning)
    4: Limited User (Basic competence in familiar situations)
    3: Extremely Limited User (Conveys only general meaning)

    Score each of the four criteria precisely from 4.0 to 9.0, limited to 0.5 increments (e.g., 6.0, 6.5, 7.0):
    1. Fluency and Coherence (fluencyScore)
    2. Lexical Resource (vocabularyScore)
    3. Grammatical Range and Accuracy (grammarScore)
    4. Pronunciation (pronunciationScore)
    
    You must calculate the overall 'bandScore' as the mathematical average of the 4 criteria, rounded down to the nearest 0.5.
    Additionally, provide a transcript of the audio.
    
    You must return your evaluation strictly in the following JSON structure without any markdown formatting:
    {
      "bandScore": number,
      "fluencyScore": number,
      "vocabularyScore": number,
      "grammarScore": number,
      "pronunciationScore": number,
      "transcript": "string",
      "detailedFeedback": {
        "fluency": ["string"],
        "pronunciation": ["string"],
        "improvements": "string"
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

    let output = result.response.text();
    if (output.startsWith('\`\`\`json')) {
      output = output.replace(/\`\`\`json\n/g, '').replace(/\`\`\`/g, '');
    } else if (output.startsWith('\`\`\`')) {
      output = output.replace(/\`\`\`\n/g, '').replace(/\`\`\`/g, '');
    }

    const parsedJson = JSON.parse(output.trim());
    return parsedJson;
  } catch (error: any) {
    console.error('Error in analyzeSpeaking:', error);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    throw new Error('Failed to analyze speaking with AI.');
  }
}
