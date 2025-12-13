import type { TranscriptSegment } from "./transcriptService";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { YOUTUBE_TRANSCRIPT_PROMPT, MATERIAL_PROMPTS, type MaterialType } from "../../data/prompts";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn(
    "[SummarizeService] GEMINI_API_KEY is not set. Summarization will use fallback mode."
  );
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export type SummarizeRequest = {
  videoId: string;
  transcript: TranscriptSegment[];
  language?: string; // e.g. 'en'
};

export type SummarizeResult = {
  success: true;
  markdown: string;
} | {
  success: false;
  error: string;
};

function buildPrompt(segments: TranscriptSegment[], language?: string) {
  // Create transcript with timestamps for better context
  const transcriptWithTimestamps = segments
    .map(s => {
      const timestamp = formatTimestamp(s.offset || 0);
      return `[${timestamp}] ${s.text}`;
    })
    .join("\n");
  
  const langHint = language ? `Write the study material in ${language}.` : "";
  return `${YOUTUBE_TRANSCRIPT_PROMPT}\n\n${langHint}\n\nTranscript with timestamps:\n${transcriptWithTimestamps}`;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export async function summarizeTranscript(req: SummarizeRequest): Promise<SummarizeResult> {
  try {
    const { transcript, language } = req;
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return { success: false, error: "Transcript is empty." };
    }

    const prompt = buildPrompt(transcript, language);

    if (!GEMINI_API_KEY) {
      // Fallback naive summary if no API key available
      const first = transcript.slice(0, 8).map(s => `- ${s.text}`).join("\n");
      const md = `# Summary\n\n> (Demo summary: set GEMINI_API_KEY for AI-generated content)\n\n## Key Points\n${first}\n\n## Notes\nThis is a local fallback summary.`;
      return { success: true, markdown: md };
    }

    // Use Gemini AI to generate study material
    const result = await geminiModel.generateContent(prompt);
    const md = result.response.text();

    if (!md) return { success: false, error: "Failed to generate summary." };

    return { success: true, markdown: removeTopLevelMarkdownBlock(md) };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to generate summary" };
  }
}

function removeTopLevelMarkdownBlock(md: string): string {
 if (md.startsWith("```markdown\n")) {
  //remove first 12 chars
  md = md.slice(12);
 }
 if (md.endsWith("```\n") ) {
  //remove last 4 chars
  md = md.slice(0, -4);
 }
 if (md.endsWith("```")) {
  //remove last 3 chars
  md = md.slice(0, -3);
 }
 return md;
}

// ===== GENERATE MATERIAL FROM EXTRACTED TEXT =====

export type { MaterialType } from "../../data/prompts";

export type GenerateMaterialRequest = {
  content: string;
  materialType: MaterialType;
};

export type GenerateMaterialResult = {
  success: true;
  markdown: string;
} | {
  success: false;
  error: string;
};

export async function generateMaterial(req: GenerateMaterialRequest): Promise<GenerateMaterialResult> {
  try {
    const { content, materialType } = req;

    if (!content || content.trim().length === 0) {
      return { success: false, error: "Content is empty." };
    }

    if (!MATERIAL_PROMPTS[materialType]) {
      return { success: false, error: "Invalid material type." };
    }

    if (!GEMINI_API_KEY) {
      // Fallback response if no API key
      const md = `# ${materialType.charAt(0).toUpperCase() + materialType.slice(1)} Material\n\n> (Demo: set GEMINI_API_KEY for AI-generated content)\n\n## Content Preview\n${content.slice(0, 500)}...\n\n## Notes\nThis is a local fallback. Configure your API key to generate AI-powered study materials.`;
      return { success: true, markdown: md };
    }

    const prompt = `${MATERIAL_PROMPTS[materialType]}\n\nContent to process:\n${content}`;

    // Use Gemini AI to generate study material
    const result = await geminiModel.generateContent(prompt);
    const md = result.response.text();

    if (!md) return { success: false, error: "Failed to generate material." };

    return { success: true, markdown: removeTopLevelMarkdownBlock(md) };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to generate material" };
  }
}