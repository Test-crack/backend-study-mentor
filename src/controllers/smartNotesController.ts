// src/controllers/smartNotes.controller.ts
import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

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
    setImmediate(() => {
      console.log(`[PROCESS] ${file.originalname} queued for analysis at path: ${file.path}`);
      // analyzeFile(file.path, fileType)
      //   .then(result => updateNoteWithAnalysis(note.id, result))
      //   .catch(err => console.error("Background processing failed:", err));
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
