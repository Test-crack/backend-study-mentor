import fs from "fs-extra";
import path from "path";
import textract from "textract";
import { extractTextFromImage, isImageFile, extractTextFromMultipleImages } from "./ocrService";
import { convertPdfToImages } from "./pdfToImageService";

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

    // 2️⃣ --- Handle PDF (use OCR directly for handwritten notes)
    else if (mimeType === "application/pdf" || ext === ".pdf") {
      console.log(`[EXTRACT] Processing PDF with OCR (best for handwritten notes)...`);
      
      // Convert PDF pages to images and run OCR
      console.log(`[EXTRACT] Step 1: Converting PDF to images...`);
      const imagePaths = await convertPdfToImages(filePath);
      console.log(`[EXTRACT] Step 1 COMPLETE: Converted to ${imagePaths.length} images`);
      console.log(`[EXTRACT] Image paths:`, imagePaths);
      
      console.log(`[EXTRACT] Step 2: Running OCR on images...`);
      const ocrResult = await extractTextFromMultipleImages(imagePaths, {
        lang: "eng",
        psm: 6, // Single uniform block of text (better for handwritten notes)
        oem: 1, // LSTM only (better for handwriting)
      });
      console.log(`[EXTRACT] Step 2 COMPLETE: OCR finished`);
      console.log(`[EXTRACT] OCR success: ${ocrResult.success}, confidence: ${ocrResult.confidence}%, text length: ${ocrResult.text?.length || 0}`);
      
      // DON'T cleanup images yet - keep them for debugging
      console.log(`[EXTRACT] Keeping images for debugging at: ${imagePaths[0] ? path.dirname(imagePaths[0]) : 'unknown'}`);
      // await Promise.all(imagePaths.map((img: string) => fs.remove(img).catch(() => {})));
      
      if (ocrResult.success && ocrResult.text && ocrResult.text.length > 20) {
        console.log(`[EXTRACT] PDF OCR confidence: ${ocrResult.confidence.toFixed(2)}%`);
        textContent = ocrResult.text;
      } else {
        throw new Error(`PDF OCR failed or returned insufficient text (confidence: ${ocrResult.confidence}%)`);
      }
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
          psm: 6, // Single uniform block of text
          oem: 1, // LSTM only
        });
        if (ocrResult.success && ocrResult.text.length > 10) {
          console.log(`[EXTRACT] ✅ OCR fallback succeeded`);
          return cleanExtractedText(ocrResult.text);
        }
      } catch (ocrErr: any) {
        console.error(`[EXTRACT] OCR fallback failed: ${ocrErr.message}`);
      }
    }

    throw new Error(`Failed to extract text: ${err.message}`);
  }
}

/* --------------------------------- HELPERS --------------------------------- */


/**
 * Extract text using textract (handles DOCX, TXT, images with OCR, etc.)
 */
function extractTextWithTextract(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    textract.fromFileWithPath(filePath, (error: Error | null, text: any) => {
      if (error) {
        console.error(`[TEXTRACT] Error: ${error.message}`);
        return reject(error);
      }
      
      // Ensure we return a string
      const textString = text ? String(text) : "";
      console.log(`[TEXTRACT] Extracted ${textString.length} characters`);
      resolve(textString);
    });
  });
}

/**
 * Normalize and clean extracted text for LLM-ready consumption
 */
function cleanExtractedText(raw: any): string {
  // Handle non-string values
  if (!raw || typeof raw !== "string") {
    console.warn(`[EXTRACT] cleanExtractedText received non-string value: ${typeof raw}`);
    return "";
  }
  
  return raw
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/[^\S\r\n]+/g, " ") // remove stray tabs
    .replace(/\n{2,}/g, "\n") // normalize newlines
    .trim();
}
