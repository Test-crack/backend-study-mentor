import type { TranscriptSegment } from "./transcriptService";
import OpenAI from "openai";
import { YOUTUBE_TRANSCRIPT_PROMPT, MATERIAL_PROMPTS, type MaterialType } from "../data/prompts";

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

    const apiKey = process.env.OPENROUTER_API_KEY ;
    const prompt = buildPrompt(transcript, language);

    if (!apiKey) {
      // Fallback naive summary if no API key available
      const first = transcript.slice(0, 8).map(s => `- ${s.text}`).join("\n");
      const md = `# Summary\n\n> (Demo summary: set OPENROUTER_API_KEY for AI-generated content)\n\n## Key Points\n${first}\n\n## Notes\nThis is a local fallback summary.`;
      return { success: true, markdown: md };
    }

    // Use official OpenAI SDK, configured for OpenRouter endpoint
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": process.env.APP_NAME || "Study Material Generator",
      },
    });

    const completion = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant for summarizing educational content." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const md = completion?.choices?.[0]?.message?.content;
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

export type { MaterialType } from "../data/prompts";

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

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      // Fallback response if no API key
      const md = `# ${materialType.charAt(0).toUpperCase() + materialType.slice(1)} Material\n\n> (Demo: set OPENROUTER_API_KEY for AI-generated content)\n\n## Content Preview\n${content.slice(0, 500)}...\n\n## Notes\nThis is a local fallback. Configure your API key to generate AI-powered study materials.`;
      return { success: true, markdown: md };
    }

    const prompt = `${MATERIAL_PROMPTS[materialType]}\n\nContent to process:\n${content}`;

    // Use OpenAI SDK configured for OpenRouter
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": process.env.APP_NAME || "Study Material Generator",
      },
    });

    const completion = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant for creating educational study materials." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const md = completion?.choices?.[0]?.message?.content;
    if (!md) return { success: false, error: "Failed to generate material." };

    return { success: true, markdown: removeTopLevelMarkdownBlock(md) };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to generate material" };
  }
}