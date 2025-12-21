import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function transcribeAudio(
  audioPath: string,
  languageHint: string = "en"
): Promise<string> {
  const audioData = fs.readFileSync(audioPath);
  
  // Detect mime type based on file extension
  const ext = path.extname(audioPath).toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
    '.opus': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
  };
  
  const mimeType = mimeTypeMap[ext] || 'audio/mpeg';

  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
  });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: audioData.toString("base64"),
      },
    },
    {
      text: `Transcribe this audio accurately. Language: ${languageHint}.
Return plain text only.`,
    },
  ]);

  return result.response.text();
}
