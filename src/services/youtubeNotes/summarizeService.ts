import type { TranscriptSegment } from "./transcriptService";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  YOUTUBE_TRANSCRIPT_PROMPT, 
  CONCEPT_METADATA_EXTRACTION_PROMPT,
  MATERIAL_PROMPTS, 
  type MaterialType 
} from "../../data/prompts";
import { slugify, removeTopLevelMarkdownBlock, formatTimestamp } from "../../helper";

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
  conceptMetadata: {
    domain: string;
    conceptSlug: string;
    keywords: string[];
    learningObjective: string;
    baseConceptId: string;
    importantKeywords: string[];  // Keywords to highlight in yellow
    criticalKeywords: string[];   // Keywords to highlight in red/orange
  };
} | {
  success: false;
  error: string;
};

function buildEnhancedPrompt(segments: TranscriptSegment[], language?: string) {
  // Create transcript with timestamps for better context
  const transcriptWithTimestamps = segments
    .map(s => {
      const timestamp = formatTimestamp(s.offset || 0);
      return `[${timestamp}] ${s.text}`;
    })
    .join("\n");
  
  const langHint = language ? `Write the study material in ${language}.` : "";
  
  return `${YOUTUBE_TRANSCRIPT_PROMPT}

${langHint}

${CONCEPT_METADATA_EXTRACTION_PROMPT}

---

Transcript with timestamps:
${transcriptWithTimestamps}`;
}

export async function generateYouTubeStudyMaterial(req: SummarizeRequest): Promise<SummarizeResult> {
  try {
    const { transcript, language } = req;
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return { success: false, error: "Transcript is empty." };
    }

    const prompt = buildEnhancedPrompt(transcript, language);

    if (!GEMINI_API_KEY) {
      // Fallback naive summary if no API key available
      const first = transcript.slice(0, 8).map(s => `- ${s.text}`).join("\n");
      const md = `# Summary\n\n> (Demo summary: set GEMINI_API_KEY for AI-generated content)\n\n## Key Points\n${first}\n\n## Notes\nThis is a local fallback summary.`;
      return { 
        success: true, 
        markdown: md,
        conceptMetadata: {
          domain: "general",
          conceptSlug: "demo-content",
          keywords: ["demo"],
          learningObjective: "Students will be able to understand the demo content.",
          baseConceptId: "GENERAL.DEMO-CONTENT",
          importantKeywords: [],
          criticalKeywords: []
        }
      };
    }

    // Use Gemini AI to generate study material + concept metadata
    const result = await geminiModel.generateContent(prompt);
    const fullResponse = result.response.text();

    if (!fullResponse) return { success: false, error: "Failed to generate study material." };

    // Extract markdown and JSON metadata
    const { markdown, metadata } = extractMarkdownAndMetadata(fullResponse);

    return { 
      success: true, 
      markdown: removeTopLevelMarkdownBlock(markdown),
      conceptMetadata: metadata
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to generate study material" };
  }
}

// Keep old function name for backward compatibility
export const summarizeTranscript = generateYouTubeStudyMaterial;

/**
 * Extract markdown content and JSON metadata from Gemini response
 */
function extractMarkdownAndMetadata(fullResponse: string): {
  markdown: string;
  metadata: {
    domain: string;
    conceptSlug: string;
    keywords: string[];
    learningObjective: string;
    baseConceptId: string;
    importantKeywords: string[];
    criticalKeywords: string[];
  };
} {
  // Try to find JSON block at the end
  const jsonMatch = fullResponse.match(/```json\s*\n([\s\S]*?)\n```/);
  
  let metadata = {
    domain: "general",
    conceptSlug: "concept",
    keywords: [] as string[],
    learningObjective: "Students will be able to understand the key concepts.",
    baseConceptId: "GENERAL.CONCEPT",
    importantKeywords: [] as string[],
    criticalKeywords: [] as string[]
  };

  let markdown = fullResponse;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      
      const domainSlug = slugify(parsed.domain || "general");
      const conceptSlug = slugify(parsed.subConcept || parsed.concept || "concept");
      const baseConceptId = `${domainSlug}.${conceptSlug}`
        .toUpperCase()
        .replace(/[^A-Z0-9.]+/g, "-");

      metadata = {
        domain: domainSlug,
        conceptSlug,
        keywords: parsed.keywords || [],
        learningObjective: parsed.learningObjective || "Students will be able to understand the key concepts.",
        baseConceptId,
        importantKeywords: parsed.importantKeywords || [],
        criticalKeywords: parsed.criticalKeywords || []
      };

      // Remove JSON block from markdown
      markdown = fullResponse.replace(/```json\s*\n[\s\S]*?\n```/, "").trim();
    } catch (err) {
      console.error("[SummarizeService] Failed to parse JSON metadata:", err);
      // Keep default metadata and full response as markdown
    }
  } else {
    console.warn("[SummarizeService] No JSON metadata found in response, using defaults");
  }

  return { markdown, metadata };
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