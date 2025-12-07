import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { fromPath } from "pdf2pic";

/**
 * Convert PDF pages to images for OCR processing
 * Useful for scanned PDFs and handwritten notes
 */

export interface PdfToImageOptions {
  format?: "png" | "jpg"; // Output format (default: png)
  scale?: number; // Scale/DPI (default: 300)
  enhanceForOCR?: boolean; // Apply image preprocessing for better OCR (default: true)
}

/**
 * Convert all pages of a PDF to images
 * @param pdfPath - Absolute path to PDF file
 * @param options - Conversion options
 * @returns Array of paths to generated image files
 */
export async function convertPdfToImages(
  pdfPath: string,
  options: PdfToImageOptions = {}
): Promise<string[]> {
  try {
    console.log(`[PDF2IMG] ========== STARTING PDF CONVERSION ==========`);
    console.log(`[PDF2IMG] Input PDF: ${pdfPath}`);
    console.log(`[PDF2IMG] PDF exists: ${await fs.pathExists(pdfPath)}`);

    const {
      format = "png",
      scale = 400, // Increased DPI from 300 to 400 for better handwriting recognition
      enhanceForOCR = true,
    } = options;

    // Create temp directory for images
    const tempDir = path.join(path.dirname(pdfPath), "temp_pdf_images");
    console.log(`[PDF2IMG] Creating temp directory: ${tempDir}`);
    await fs.ensureDir(tempDir);
    console.log(`[PDF2IMG] Temp directory created successfully`);

    const outputPrefix = `page`;
    console.log(`[PDF2IMG] Converting PDF to images with pdf2pic (DPI: ${scale})...`);

    // Configure pdf2pic options
    const converter = fromPath(pdfPath, {
      density: scale,
      saveFilename: outputPrefix,
      savePath: tempDir,
      format: format,
      width: 2480,
      height: 3508
    });

    // Get PDF page count and convert all pages
    const pdfStats = await fs.stat(pdfPath);
    console.log(`[PDF2IMG] PDF size: ${pdfStats.size} bytes`);
    
    // Convert pages (pdf2pic uses 1-based indexing)
    let pageNum = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      try {
        await converter(pageNum, { responseType: "image" });
        pageNum++;
      } catch (error) {
        hasMorePages = false;
      }
    }
    
    console.log(`[PDF2IMG] pdf2pic conversion complete`);

    // Get all generated image files
    const files = await fs.readdir(tempDir);
    let imagePaths = files
      .filter((file) => file.startsWith(outputPrefix) && (file.endsWith(".png") || file.endsWith(".jpg")))
      .sort() // Sort to maintain page order
      .map((file) => path.join(tempDir, file));

    // Apply image preprocessing for better OCR if enabled
    if (enhanceForOCR && imagePaths.length > 0) {
      console.log(`[PDF2IMG] Applying image preprocessing for better OCR...`);
      imagePaths = await enhanceImagesForOCR(imagePaths);
      console.log(`[PDF2IMG] Image preprocessing complete`);
    }

    console.log(`[PDF2IMG] ✅ Converted ${imagePaths.length} pages to images`);
    console.log(`[PDF2IMG] All image paths:`, imagePaths);
    console.log(`[PDF2IMG] ========== PDF CONVERSION COMPLETE ==========`);
    return imagePaths;
  } catch (error: any) {
    console.error(`[PDF2IMG] ❌ CONVERSION FAILED`);
    console.error(`[PDF2IMG] Error message: ${error.message}`);
    console.error(`[PDF2IMG] Error stack:`, error.stack);
    throw new Error(`Failed to convert PDF to images: ${error.message}`);
  }
}



/**
 * Enhance images for better OCR recognition
 * Applies preprocessing: grayscale, contrast, sharpening
 * @param imagePaths - Array of image file paths
 * @returns Array of enhanced image file paths
 */
async function enhanceImagesForOCR(imagePaths: string[]): Promise<string[]> {
  const enhancedPaths: string[] = [];

  for (const imagePath of imagePaths) {
    try {
      const enhancedPath = imagePath.replace(/\.(png|jpg)$/, "_enhanced.$1");
      
      await sharp(imagePath)
        .grayscale() // Convert to grayscale
        .normalize() // Normalize contrast
        .sharpen() // Sharpen edges for better text recognition
        .toFile(enhancedPath);

      enhancedPaths.push(enhancedPath);
      console.log(`[PDF2IMG] Enhanced: ${path.basename(enhancedPath)}`);
    } catch (error: any) {
      console.warn(`[PDF2IMG] Failed to enhance ${imagePath}: ${error.message}`);
      // Fallback to original if enhancement fails
      enhancedPaths.push(imagePath);
    }
  }

  return enhancedPaths;
}

/**
 * Cleanup temporary image files
 * @param imagePaths - Array of image file paths to delete
 */
export async function cleanupTempImages(imagePaths: string[]): Promise<void> {
  try {
    await Promise.all(imagePaths.map(imgPath => fs.remove(imgPath)));
    
    // Also remove the temp directory if empty
    if (imagePaths.length > 0) {
      const tempDir = path.dirname(imagePaths[0]);
      const files = await fs.readdir(tempDir);
      if (files.length === 0) {
        await fs.remove(tempDir);
      }
    }
    
    console.log(`[PDF2IMG] Cleaned up ${imagePaths.length} temporary images`);
  } catch (error: any) {
    console.warn(`[PDF2IMG] Cleanup warning: ${error.message}`);
  }
}
