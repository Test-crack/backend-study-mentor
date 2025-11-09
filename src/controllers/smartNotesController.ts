// src/controllers/smartNotes.controller.ts
import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { extractTextFromFile } from "../services/textExtractor.service";


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

    // ✅ Queue background analysis (non-blocking)
    setImmediate(async () => {
      console.log(`[PROCESS] ${file.originalname} queued for analysis at path: ${file.path}`);
      try {
        console.log(`[PROCESS] Starting text extraction for: ${file.originalname}`);
        const extractedText = await extractTextFromFile(file.path, file.mimetype);

        console.log(`[PROCESS] Extraction successful: ${extractedText.slice(0, 200)}...`);

        // ✅ Save extracted text to .txt file
        const extractedDir = path.resolve(__dirname, "../../uploads/extracted");
        fs.mkdirSync(extractedDir, { recursive: true });
        
        const baseFileName = path.parse(file.filename).name;
        const txtFilePath = path.join(extractedDir, `${baseFileName}.txt`);
        
        await fs.promises.writeFile(txtFilePath, extractedText, "utf-8");
        console.log(`[PROCESS] Extracted text saved to: ${txtFilePath}`);

    // 👉 Later: Save extracted text to DB or trigger LLM summarization here
    // await prisma.note.update({ where: { id: note.id }, data: { content: extractedText } });

  } catch (err) {
      console.error(`[PROCESS] Extraction failed for ${file.originalname}:`, err);
  }
    });

    // ✅ Send success response
    const responsePayload = {
      success: true,
      message: "File uploaded successfully and queued for processing",
      fileInfo: {
        name: file.originalname,
        path: `/uploads/${file.filename}`,
        type: fileType,
        size: fileSize,
        lastModified,
      },
    };
    console.log("[CTRL] Success response:", responsePayload);
    res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};
