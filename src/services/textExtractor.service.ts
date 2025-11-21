import fs from "fs-extra";
import path from "path";
import textract from "textract";
import { extractTextFromImage, isImageFile } from "./ocrService";

/**
 * Extract text content from various file types.
 * - Uses pdfjs-dist for PDFs (most reliable)
 * - Falls back to textract for other formats or failed extractions
 * - Normalizes output for LLM consumption
 *
 * @param filePath - Absolute path to file on disk
 * @param mimeType - Optional MIME type (e.g. "application/pdf")
 * @returns Cleaned, plain text extracted from the file
 */
export async function extractTextFromFile(filePath: string, mimeType?: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  let textContent = "";

  try {
    console.log(`[EXTRACT] Starting extraction for: ${filePath} (${mimeType || ext})`);

    // 1️⃣ --- Handle images with OCR (including handwritten notes)
    if (isImageFile(filePath, mimeType)) {
      console.log(`[EXTRACT] Detected image file, using OCR...`);
      const ocrResult = await extractTextFromImage(filePath, { lang: "eng" });
      
      if (ocrResult.success && ocrResult.text.length > 20) {
        console.log(`[EXTRACT] OCR confidence: ${ocrResult.confidence.toFixed(2)}%`);
        textContent = ocrResult.text;
      } else {
        throw new Error(`OCR failed or returned insufficient text (confidence: ${ocrResult.confidence}%)`);
      }
    }

    // 2️⃣ --- Handle PDF via pdf-parse (most reliable for Node.js)
    else if (mimeType === "application/pdf" || ext === ".pdf") {
      textContent = await extractWithPdfParse(filePath);
    }

    // 3️⃣ --- Handle DOCX / TXT / other with textract
    else {
      textContent = await extractTextWithTextract(filePath);
    }

    // 4️⃣ --- Clean + normalize text for better LLM input
    textContent = cleanExtractedText(textContent);

    if (!textContent || textContent.length < 20) {
      throw new Error("Extracted text too short or empty");
    }

    console.log(`[EXTRACT] ✅ Successfully extracted ~${textContent.length} chars from ${path.basename(filePath)}`);
    return textContent;
  } catch (err: any) {
    console.error(`[EXTRACT] Error processing ${filePath}: ${err.message}`);

    // 5️⃣ --- Fallback strategies if extraction fails
    
    // Try OCR as fallback for images
    if (isImageFile(filePath, mimeType)) {
      console.warn(`[EXTRACT] ⚠️ Image extraction failed, trying OCR with different settings...`);
      try {
        const ocrResult = await extractTextFromImage(filePath, { 
          lang: "eng",
          psm: 11, // Sparse text mode for handwritten notes
        });
        if (ocrResult.success && ocrResult.text.length > 10) {
          console.log(`[EXTRACT] ✅ OCR fallback succeeded`);
          return cleanExtractedText(ocrResult.text);
        }
      } catch (ocrErr: any) {
        console.error(`[EXTRACT] OCR fallback failed: ${ocrErr.message}`);
      }
    }

    // 6️⃣ --- Fallback strategies if PDF parsing fails
    if (mimeType === "application/pdf" || ext === ".pdf") {
      console.warn(`[EXTRACT] ⚠️ PDF extraction failed, attempting fallbacks...`);
      
      // Try pdf-parse as fallback (simpler, no external deps)
      try {
        console.log(`[EXTRACT] Trying pdf-parse fallback...`);
        const fallbackText = await extractWithPdfParse(filePath);
        const cleaned = cleanExtractedText(fallbackText);
        if (cleaned && cleaned.length > 20) {
          console.log(`[EXTRACT] ✅ Fallback succeeded via pdf-parse`);
          return cleaned;
        }
      } catch (pdfParseErr: any) {
        console.error(`[EXTRACT] pdf-parse fallback failed: ${pdfParseErr.message}`);
      }

      // Try textract as last resort (requires pdftotext)
      try {
        console.log(`[EXTRACT] Trying textract fallback...`);
        const fallbackText = await extractTextWithTextract(filePath);
        const cleaned = cleanExtractedText(fallbackText);
        if (cleaned && cleaned.length > 20) {
          console.log(`[EXTRACT] ✅ Fallback succeeded via textract`);
          return cleaned;
        }
      } catch (textractErr: any) {
        console.error(`[EXTRACT] ❌ Textract fallback failed: ${textractErr.message}`);
      }
    }

    throw new Error(`Failed to extract text: ${err.message}`);
  }
}

/* --------------------------------- HELPERS --------------------------------- */

/**
 * Extract text using pdf-parse (simple fallback, no external deps)
 */
async function extractWithPdfParse(filePath: string): Promise<string> {
  const { PDFParse } = require("pdf-parse");
  const dataBuffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  await parser.load();
  const text = await parser.getText();
  return text;
}


/**
 * Extract text using textract (handles DOCX, TXT, images with OCR, etc.)
 */
function extractTextWithTextract(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    textract.fromFileWithPath(filePath, (error: Error | null, text: string | undefined) => {
      if (error) return reject(error);
      resolve(text || "");
    });
  });
}

/**
 * Normalize and clean extracted text for LLM-ready consumption
 */
function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/[^\S\r\n]+/g, " ") // remove stray tabs
    .replace(/\n{2,}/g, "\n") // normalize newlines
    .trim();
}
