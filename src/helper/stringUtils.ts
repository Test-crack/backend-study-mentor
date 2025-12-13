/**
 * String utility functions for text processing
 */

/**
 * Basic slugify: "Water Cycle" -> "water-cycle"
 * Converts a string to a URL-friendly slug format
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

/**
 * Smart truncation that preserves context by breaking at natural boundaries
 * Tries to break at paragraph boundaries first, then sentences, then hard cut
 */
export function smartTruncate(text: string, maxChars: number = 6000): string {
  if (text.length <= maxChars) return text;
  
  // Try to break at paragraph
  const truncated = text.slice(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  
  if (lastParagraph > maxChars * 0.7) {
    return truncated.slice(0, lastParagraph) + "\n\n[TRUNCATED]";
  }
  
  // Fallback: break at sentence
  const lastSentence = truncated.lastIndexOf('. ');
  if (lastSentence > maxChars * 0.7) {
    return truncated.slice(0, lastSentence + 1) + "\n\n[TRUNCATED]";
  }
  
  return truncated + "\n\n[TRUNCATED]";
}

/**
 * Remove top-level markdown code block wrapper if present
 * Handles cases where LLM wraps response in ```markdown ... ```
 */
export function removeTopLevelMarkdownBlock(md: string): string {
  if (md.startsWith("```markdown\n")) {
    // Remove first 12 chars
    md = md.slice(12);
  }
  if (md.endsWith("```\n")) {
    // Remove last 4 chars
    md = md.slice(0, -4);
  }
  if (md.endsWith("```")) {
    // Remove last 3 chars
    md = md.slice(0, -3);
  }
  return md;
}

/**
 * Format seconds to MM:SS timestamp format
 */
export function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}
