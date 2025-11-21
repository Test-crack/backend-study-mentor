import Tesseract from "tesseract.js";
import fs from "fs-extra";
import path from "path";

/**
 * OCR Service using Tesseract.js
 * Handles image-based text extraction including handwritten notes
 */

export interface OCROptions {
  lang?: string; // Language code (e.g., 'eng', 'spa', 'fra')
  psm?: number; // Page segmentation mode (0-13)
  oem?: number; // OCR Engine mode (0-3)
}

export interface OCRResult {
  text: string;
  confidence: number;
  success: boolean;
  error?: string;
}

/**
 * Extract text from an image file using Tesseract OCR
 * @param imagePath - Absolute path to image file
 * @param options - OCR configuration options
 * @returns OCR result with extracted text and confidence score
 */
export async function extractTextFromImage(
  imagePath: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  try {
    console.log(`[OCR] Starting OCR for: ${path.basename(imagePath)}`);

    // Validate file exists
    if (!await fs.pathExists(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }

    const {
      lang = "eng", // Default to English
      psm = 3, // Default: Fully automatic page segmentation
      oem = 3, // Default: LSTM neural net mode
    } = options;

    // Initialize Tesseract worker
    const worker = await Tesseract.createWorker(lang, oem as any, {
      logger: (m: any) => {
        if (m.status === "recognizing text") {
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    // Set page segmentation mode
    await worker.setParameters({
      tessedit_pageseg_mode: psm as any,
    });

    // Perform OCR
    const { data } = await worker.recognize(imagePath);

    // Cleanup
    await worker.terminate();

    const cleanedText = cleanOCRText(data.text);
    const confidence = data.confidence;

    console.log(`[OCR] ✅ Extraction complete. Confidence: ${confidence.toFixed(2)}%, Length: ${cleanedText.length} chars`);

    return {
      text: cleanedText,
      confidence,
      success: true,
    };
  } catch (error: any) {
    console.error(`[OCR] ❌ Error: ${error.message}`);
    return {
      text: "",
      confidence: 0,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Extract text from multiple images (batch processing)
 * @param imagePaths - Array of absolute paths to image files
 * @param options - OCR configuration options
 * @returns Combined text from all images
 */
export async function extractTextFromMultipleImages(
  imagePaths: string[],
  options: OCROptions = {}
): Promise<OCRResult> {
  try {
    console.log(`[OCR] Batch processing ${imagePaths.length} images...`);

    const results = await Promise.all(
      imagePaths.map((imagePath) => extractTextFromImage(imagePath, options))
    );

    const successfulResults = results.filter((r) => r.success);
    
    if (successfulResults.length === 0) {
      throw new Error("All OCR attempts failed");
    }

    const combinedText = successfulResults.map((r) => r.text).join("\n\n");
    const avgConfidence = successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length;

    console.log(`[OCR] ✅ Batch complete. ${successfulResults.length}/${imagePaths.length} successful. Avg confidence: ${avgConfidence.toFixed(2)}%`);

    return {
      text: combinedText,
      confidence: avgConfidence,
      success: true,
    };
  } catch (error: any) {
    console.error(`[OCR] ❌ Batch error: ${error.message}`);
    return {
      text: "",
      confidence: 0,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if a file is an image that can be processed by OCR
 * @param filePath - Path to file
 * @param mimeType - Optional MIME type
 * @returns True if file is a supported image format
 */
export function isImageFile(filePath: string, mimeType?: string): boolean {
  const imageExtensions = [".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".gif"];
  const imageMimeTypes = ["image/png", "image/jpeg", "image/tiff", "image/bmp", "image/gif"];

  const ext = path.extname(filePath).toLowerCase();
  
  if (mimeType && imageMimeTypes.includes(mimeType)) {
    return true;
  }

  return imageExtensions.includes(ext);
}

/**
 * Clean and normalize OCR-extracted text
 * @param raw - Raw OCR output
 * @returns Cleaned text
 */
function cleanOCRText(raw: string): string {
  return raw
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/\n{3,}/g, "\n\n") // Normalize excessive newlines
    .replace(/[^\S\r\n]+/g, " ") // Remove tabs and other whitespace
    .trim();
}

/**
 * Get recommended PSM (Page Segmentation Mode) based on content type
 */
export const PSM_MODES = {
  AUTO: 3, // Fully automatic page segmentation (default)
  SINGLE_COLUMN: 4, // Single column of text
  SINGLE_BLOCK: 6, // Single uniform block of text
  SINGLE_LINE: 7, // Single text line
  SINGLE_WORD: 8, // Single word
  SPARSE_TEXT: 11, // Sparse text (find as much text as possible)
  RAW_LINE: 13, // Raw line (no layout analysis)
} as const;

/**
 * Get recommended OEM (OCR Engine Mode)
 */
export const OEM_MODES = {
  LEGACY: 0, // Legacy Tesseract engine
  LSTM: 1, // LSTM neural net mode only
  LEGACY_LSTM: 2, // Legacy + LSTM
  DEFAULT: 3, // Default (LSTM)
} as const;
