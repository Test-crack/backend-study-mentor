import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getDiagnosticStatus, getDiagnosticQuestionsBySkill, submitDiagnosticAssessment, submitDiagnosticSpeaking } from '../controllers/diagnosticController';

const router = Router();
// Cap speaking uploads at 15 MB — a ~90s recording is well under this; the limit
// stops an unbounded multipart body from filling disk.
const upload = multer({ dest: 'uploads/', limits: { fileSize: 15 * 1024 * 1024 } });

// Turn multer's size-limit rejection into a clean, retryable 413 (default is a raw 500).
function handleSpeakingUpload(req: Request, res: Response, next: NextFunction) {
    upload.single('audio')(req, res, (err: any) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'file_too_large', can_retry: true, message: 'Recording too large (max 15 MB). Please re-record a shorter answer.' });
            }
            return res.status(400).json({ error: 'upload_failed', can_retry: true, message: 'Audio upload failed. Please try again.' });
        }
        next();
    });
}

// Determine status of diagnostic
router.get('/status', getDiagnosticStatus);

// Get the questions customized by level (determined internally)
router.get('/questions/:skill', getDiagnosticQuestionsBySkill);

// Submit speaking specifically (requires multipart/form-data)
router.post('/submit/speaking', handleSpeakingUpload, submitDiagnosticSpeaking);

// Submit each section (listening, reading, writing - expects JSON payload)
router.post('/submit/:skill', submitDiagnosticAssessment);

export default router;
