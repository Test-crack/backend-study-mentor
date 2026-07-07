import { Router } from 'express';
import multer from 'multer';
import { getDiagnosticStatus, getDiagnosticQuestionsBySkill, submitDiagnosticAssessment, submitDiagnosticSpeaking } from '../controllers/diagnosticController';

const router = Router();
// Cap speaking uploads at 15 MB — a ~90s recording is well under this; the limit
// stops an unbounded multipart body from filling disk.
const upload = multer({ dest: 'uploads/', limits: { fileSize: 15 * 1024 * 1024 } });

// Determine status of diagnostic
router.get('/status', getDiagnosticStatus);

// Get the questions customized by level (determined internally)
router.get('/questions/:skill', getDiagnosticQuestionsBySkill);

// Submit speaking specifically (requires multipart/form-data)
router.post('/submit/speaking', upload.single('audio'), submitDiagnosticSpeaking);

// Submit each section (listening, reading, writing - expects JSON payload)
router.post('/submit/:skill', submitDiagnosticAssessment);

export default router;
