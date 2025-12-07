// src/controllers/smartNotes.controller.ts
import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { extractTextFromFile } from "../services/textExtractor.service";
import { generateMaterial } from "../services/summarizeService";


// === Ensure uploads directory exists ===
const uploadDir = path.resolve(__dirname, "../../uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`[UPLOADS] Ensured upload directory exists at: ${uploadDir}`);
} catch (err) {
  console.error("[UPLOADS] Failed to ensure uploads directory:", err);
}

// === Configure Multer storage ===
const storage = multer.diskStorage({
  destination: (_req: any, file: any, cb: any) => {
    console.log(`[MULTER] Destination resolved for file: ${file?.originalname || 'unknown'} → ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: (_req: any, file: any, cb: any) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    console.log(`[MULTER] Filename generated: ${uniqueName}`);
    cb(null, uniqueName);
  },
});

// === Multer instance with validation ===
export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
  fileFilter: (_req: any, file: any, cb: any) => {
    console.log(`[MULTER] Incoming file mimetype: ${file?.mimetype}`);
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      console.log("[MULTER] File accepted by filter");
      cb(null, true);
    } else {
      console.warn("[MULTER] File rejected by filter (unsupported type)");
      cb(new Error("Unsupported file type"), false);
    }
  },
});

// === Extend Express Request type to include file ===
interface FileRequest extends Request {
  file?: any;
}

// === Controller ===
export const uploadNotesController = async (req: FileRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;

    if (!file) {
      console.warn("[CTRL] No file found on request (req.file is undefined)");
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { fileName, fileType, fileSize, lastModified } = req.body;

    // ✅ I need to save the metadata to DB here (optional)
    // Example (pseudo):
    // const note = await prisma.note.create({
    //   data: {
    //     title: fileName,
    //     filePath: file.path,
    //     fileType,
    //     fileSize: Number(fileSize),
    //     lastModified: new Date(Number(lastModified)),
    //   },
    // });

    // ✅ Extract text immediately (blocking to get the path)
    console.log(`[PROCESS] Starting text extraction for: ${file.originalname}`);
    console.log(`[PROCESS] File path: ${file.path}`);
    console.log(`[PROCESS] MIME type: ${file.mimetype}`);
    
    const extractedText = await extractTextFromFile(file.path, file.mimetype);
    
    console.log(`[PROCESS] Extraction successful! Length: ${extractedText.length} chars`);
    console.log(`[PROCESS] Preview: ${extractedText.slice(0, 200)}...`);

    // ✅ Save extracted text to .txt file
    const extractedDir = path.resolve(__dirname, "../../uploads/extracted");
    fs.mkdirSync(extractedDir, { recursive: true });
    
    const baseFileName = path.parse(file.filename).name;
    const txtFilePath = path.join(extractedDir, `${baseFileName}.txt`);
    
    await fs.promises.writeFile(txtFilePath, extractedText, "utf-8");
    console.log(`[PROCESS] Extracted text saved to: ${txtFilePath}`);

    // 👉 Later: Save extracted text to DB or trigger LLM summarization here
    // await prisma.note.update({ where: { id: note.id }, data: { content: extractedText } });

    // ✅ Send success response with extracted file path
    const responsePayload = {
      success: true,
      message: "File uploaded and processed successfully",
      fileInfo: {
        name: file.originalname,
        originalPath: `/uploads/${file.filename}`,
        extractedPath: `/uploads/extracted/${baseFileName}.txt`,
        type: fileType,
        size: fileSize,
        lastModified,
      },
    };
    console.log("[CTRL] Success response:", responsePayload);
    res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error("❌ Upload error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ 
      error: error.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


export const generateMaterialController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { extractedPath, materialType } = req.body;

    if (!extractedPath) {
      res.status(400).json({ error: "extractedPath is required" });
      return;
    }

    if (!materialType) {
      res.status(400).json({ error: "materialType is required (overview, standard, detailed, quiz)" });
      return;
    }

    // Validate materialType
    const validTypes = ["overview", "standard", "detailed", "quiz"];
    if (!validTypes.includes(materialType)) {
      res.status(400).json({ error: `Invalid materialType. Must be one of: ${validTypes.join(", ")}` });
      return;
    }

    // Construct full file path
    const extractedDir = path.resolve(__dirname, "../../uploads/extracted");
    const fileName = path.basename(extractedPath);
    const fullPath = path.join(extractedDir, fileName);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.warn(`[CTRL] File not found: ${fullPath}`);
      res.status(404).json({ 
        error: "Extracted file not found. Please re-upload the file.",
        extractedPath 
      });
      return;
    }

    // Read the extracted text
    console.log(`[CTRL] Reading extracted text from: ${fullPath}`);
    const extractedText = await fs.promises.readFile(fullPath, "utf-8");

    if (!extractedText || extractedText.trim().length === 0) {
      res.status(400).json({ error: "Extracted file is empty" });
      return;
    }

    // Generate material using the service
    console.log(`[CTRL] Generating ${materialType} material...`);
    
    const result = await generateMaterial({
      content: extractedText,
      materialType: materialType as "overview" | "standard" | "detailed" | "quiz",
    });

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    // Send success response
    res.status(200).json({
      success: true,
      materialType,
      markdown: result.markdown,
    });

  } catch (error: any) {
    console.error("❌ Generate material error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}; 
