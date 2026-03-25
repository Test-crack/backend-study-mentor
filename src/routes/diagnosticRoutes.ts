import { Router } from 'express';
import multer from 'multer';
import { getDiagnosticStatus, getDiagnosticQuestionsBySkill, submitDiagnosticAssessment, submitDiagnosticSpeaking } from '../controllers/diagnosticController';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Determine status of diagnostic
router.get('/status', getDiagnosticStatus);

// Get the questions customized by level (determined internally)
router.get('/questions/:skill', getDiagnosticQuestionsBySkill);

// Submit speaking specifically (requires multipart/form-data)
router.post('/submit/speaking', upload.single('audio'), submitDiagnosticSpeaking);

// Submit each section (listening, reading, writing - expects JSON payload)
router.post('/submit/:skill', submitDiagnosticAssessment);

export default router;
