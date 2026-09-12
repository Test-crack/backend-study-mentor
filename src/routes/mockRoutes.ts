import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
    getMockStatus,
    getMockQuestions,
    getSessionState,
    startMockSection,
    saveMockAnswer,
    submitMock,
} from '../controllers/mockController';
import { getSpokenEnglishMock, submitSpokenEnglishMock } from '../controllers/spokenEnglishMockController';

const router = Router();

// Spoken English full mock is record-and-submit (one audio per prompt) — multipart, capped like the
// diagnostic viva / SE IA. Each file's fieldname is its promptId, so accept any fields.
const upload = multer({ dest: 'uploads/', limits: { fileSize: 15 * 1024 * 1024, files: 12 } });
function handleMockAudio(req: Request, res: Response, next: NextFunction) {
    upload.any()(req, res, (err: any) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: 'A recording is too large (max 15 MB each).', can_retry: true });
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ success: false, error: 'Too many recordings submitted.', can_retry: true });
            return res.status(400).json({ success: false, error: 'Audio upload failed. Please try again.', can_retry: true });
        }
        next();
    });
}

router.get('/status',                getMockStatus);
router.get('/questions',             getMockQuestions);   // create or resume session → returns section overview
router.get('/session/:sessionId',    getSessionState);    // lazy expiry + current state
router.post('/sections/start',       startMockSection);   // start a section → returns its questions
router.post('/answer',               saveMockAnswer);     // auto-save answer to section row
router.post('/submit',               submitMock);         // submit section; grade when all done

// Spoken English full mock (record-and-submit, viva-graded → CEFR).
router.get('/se/questions',          getSpokenEnglishMock);
router.post('/se/submit',            handleMockAudio, submitSpokenEnglishMock);

export default router;
