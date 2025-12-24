# OCR Service Usage Guide

## Overview
The OCR service uses Tesseract.js to extract text from images, including handwritten notes.

## Features
- ✅ Automatic image detection and OCR processing
- ✅ Support for PNG, JPG, JPEG, TIFF, BMP, GIF
- ✅ Handwritten notes recognition
- ✅ Batch processing for multiple images
- ✅ Confidence scoring
- ✅ Multiple language support

## Installation (Ubuntu VPS)

```bash
# Tesseract.js works out of the box with Node.js
# No system dependencies required (uses WASM)
npm install tesseract.js
```

## Basic Usage

### Single Image
```typescript
import { extractTextFromImage } from "./services/ocrService";

const result = await extractTextFromImage("/path/to/image.jpg");
console.log(result.text);
console.log(`Confidence: ${result.confidence}%`);
```

### Multiple Images
```typescript
import { extractTextFromMultipleImages } from "./services/ocrService";

const result = await extractTextFromMultipleImages([
  "/path/to/page1.jpg",
  "/path/to/page2.jpg"
]);
console.log(result.text);
```

### Custom Options
```typescript
const result = await extractTextFromImage("/path/to/image.jpg", {
  lang: "eng", // Language: eng, spa, fra, deu, etc.
  psm: 11, // Page segmentation mode (11 = sparse text for handwritten)
  oem: 3, // OCR engine mode (3 = LSTM neural net)
});
```

## Page Segmentation Modes (PSM)

```typescript
import { PSM_MODES } from "./services/ocrService";

PSM_MODES.AUTO           // 3 - Fully automatic (default)
PSM_MODES.SINGLE_COLUMN  // 4 - Single column of text
PSM_MODES.SINGLE_BLOCK   // 6 - Single uniform block
PSM_MODES.SINGLE_LINE    // 7 - Single text line
PSM_MODES.SPARSE_TEXT    // 11 - Sparse text (best for handwritten notes)
```

## Integration with Text Extractor

The OCR service is automatically integrated into `textExtractor.service.ts`:

1. **Automatic detection**: Image files are detected by extension/MIME type
2. **Primary extraction**: OCR runs with default settings
3. **Fallback mode**: If primary fails, retries with sparse text mode (PSM 11)

## Supported Languages

Default: English (`eng`)

To use other languages:
```typescript
extractTextFromImage(path, { lang: "spa" }); // Spanish
extractTextFromImage(path, { lang: "fra" }); // French
extractTextFromImage(path, { lang: "deu" }); // German
```

## Performance Tips

1. **Image quality**: Higher resolution = better accuracy
2. **Preprocessing**: Consider image enhancement for low-quality scans
3. **Batch processing**: Use `extractTextFromMultipleImages` for efficiency
4. **PSM selection**: Use PSM 11 for handwritten notes, PSM 3 for printed text

## Error Handling

```typescript
const result = await extractTextFromImage(path);

if (!result.success) {
  console.error(`OCR failed: ${result.error}`);
  // Handle error
}

if (result.confidence < 50) {
  console.warn("Low confidence, text may be inaccurate");
}
```
