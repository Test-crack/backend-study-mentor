import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getDiagnosticStatus, getDiagnosticQuestionsBySkill, submitDiagnosticAssessment, submitDiagnosticSpeaking, getDiagnosticVivaPrompts, submitDiagnosticViva } from '../controllers/diagnosticController';

const router = Router();
// Cap speaking uploads at 15 MB — a ~90s recording is well under this; the limit
// stops an unbounded multipart body from filling disk.
const upload = multer({ dest: 'uploads/', limits: { fileSize: 15 * 1024 * 1024, files: 12 } });

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

// Viva submits one recording per prompt; each file's fieldname is its promptId, so we
// take any fields (upload.any) rather than a fixed name. Cap total file count to the
// prompt set size + slack, each file still bounded by the 15 MB fileSize limit above.
function handleVivaUpload(req: Request, res: Response, next: NextFunction) {
    upload.any()(req, res, (err: any) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'file_too_large', can_retry: true, message: 'A recording is too large (max 15 MB each). Please re-record a shorter answer.' });
            }
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
                return res.status(413).json({ error: 'too_many_files', can_retry: true, message: 'Too many recordings submitted.' });
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

// Config-driven viva diagnostic (Spoken English & future viva exams).
router.get('/viva/prompts', getDiagnosticVivaPrompts);
router.post('/viva/submit', handleVivaUpload, submitDiagnosticViva);

// Submit each section (listening, reading, writing - expects JSON payload)
router.post('/submit/:skill', submitDiagnosticAssessment);

export default router;
