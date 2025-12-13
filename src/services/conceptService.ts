// src/services/conceptService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { slugify, smartTruncate } from "../helper";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn(
    "[ConceptService] GEMINI_API_KEY is not set. Concept generation will fail until it is configured."
  );
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type SourceType = "pdf" | "youtube" | "note" | "text";

export interface ConceptAnalysisInput {
  text: string;          // extracted text / transcript / notes
  title?: string;        // optional: document title, video title, etc.
  sourceType?: SourceType;
}

export interface ConceptAnalysisResult {
  domain: string;              // e.g. "science"
  conceptSlug: string;         // e.g. "water-cycle"
  keywords: string[];          // ["evaporation", "condensation"]
  learningObjective: string;   // "Students will be able to..."
  baseConceptId: string;       // e.g. "SCIENCE.WATER-CYCLE"
}

/**
 * Final concept ID once you add a sequence from DB
 * e.g. SCIENCE.WATER-CYCLE.001
 */
export function buildFullConceptId(
  baseConceptId: string,
  sequence: number
): string {
  const seq = String(sequence).padStart(3, "0");
  return `${baseConceptId}.${seq}`;
}

/* -------------------------------------------------------------------------- */
/*                                MAIN SERVICE                                */
/* -------------------------------------------------------------------------- */

/**
 * Analyze raw content using Gemini and produce:
 * - domain
 * - conceptSlug
 * - keywords
 * - learningObjective
 * - baseConceptId (DOMAIN.CONCEPT)
 *
 * This does NOT touch the database.
 * You can call this from your controller, then:
 * 1) Look up existing concept in Postgres
 * 2) Decide sequence number
 * 3) Use buildFullConceptId() to get final concept ID
 */
export async function analyzeContentToConcept(
  input: ConceptAnalysisInput
): Promise<ConceptAnalysisResult> {
  const { text, title, sourceType } = input;

  if (!text || text.trim().length < 50) {
    throw new Error(
      "Content too short to analyze. Provide at least ~50 characters."
    );
  }

  const truncatedText = smartTruncate(text, 6000);

  const prompt = buildGeminiPrompt(truncatedText, title, sourceType);

  const result = await geminiModel.generateContent(prompt);
  const responseText = result.response.text();

  const parsed = safeParseConceptResponse(responseText);
  
  // Validate the AI response quality
  validateConceptResult(parsed);

  const domainSlug = slugify(parsed.domain || "general");
  const conceptSlug = slugify(parsed.subConcept || parsed.concept || "concept");

  const baseConceptId = `${domainSlug}.${conceptSlug}`
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, "-");

  return {
    domain: domainSlug,
    conceptSlug,
    keywords: parsed.keywords || [],
    learningObjective:
      parsed.learningObjective ||
      "Students will be able to understand the key ideas in this content.",
    baseConceptId,
  };
}

/* -------------------------------------------------------------------------- */
/*                               HELPER FUNCTIONS                             */
/* -------------------------------------------------------------------------- */

function buildGeminiPrompt(
  text: string,
  title?: string,
  sourceType?: SourceType
): string {
  return `
You are a curriculum design assistant for an ed-tech platform.

Your job:
1. Identify the MAIN domain (like "science", "math", "engineering", "medicine", "business", "law", "computer-science", etc.)
2. Identify ONE primary sub-concept (e.g. "water cycle", "linked lists", "photosynthesis", "supply and demand").
3. Extract 3–5 keywords.
4. Generate ONE learning objective starting with: "Students will be able to..."

Rules:
- Focus on HIGH-LEVEL conceptual grouping, not tiny details.
- Domain should be a single word or hyphenated (e.g. "life-sciences").
- Sub-concept should be short but meaningful (2–5 words).
- Respond as STRICT JSON only. No extra text.

Return JSON in this exact shape:

{
  "domain": "string",
  "subConcept": "string",
  "keywords": ["string"],
  "learningObjective": "string"
}

Additional context:
- Source type: ${sourceType || "unknown"}
- Title: ${title || "N/A"}

Content to analyze (may be truncated):
"""  
${text}
"""
`;
}

interface RawConceptResponse {
  domain?: string;
  subConcept?: string;
  concept?: string;
  keywords?: string[];
  learningObjective?: string;
}

/**
 * Gemini sometimes wraps JSON in markdown or text.
 * This safely extracts the JSON object.
 */
function safeParseConceptResponse(raw: string): RawConceptResponse {
  try {
    // Try direct parse first
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON block
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("[ConceptService] No JSON found in Gemini response.");
      return {};
    }

    try {
      return JSON.parse(match[0]);
    } catch (err) {
      console.error("[ConceptService] Failed to parse JSON from Gemini:", err);
      return {};
    }
  }
}

/**
 * Validates the quality of AI-generated concept response
 */
function validateConceptResult(parsed: RawConceptResponse): void {
  if (!parsed.domain || parsed.domain.length < 2) {
    throw new Error("Invalid domain returned by AI");
  }
  
  if (!parsed.subConcept && !parsed.concept) {
    throw new Error("No concept identified by AI");
  }
  
  if (!parsed.keywords || parsed.keywords.length === 0) {
    console.warn("[ConceptService] No keywords extracted, using empty array");
  }
  
  if (!parsed.learningObjective || parsed.learningObjective.length < 10) {
    console.warn("[ConceptService] Learning objective is too short or missing");
  }
}
