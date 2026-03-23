import { Router } from 'express';
import { getDiagnosticStatus, getDiagnosticQuestionsBySkill, submitDiagnosticAssessment } from '../controllers/diagnosticController';

const router = Router();

// Determine status of diagnostic
router.get('/status', getDiagnosticStatus);

// Get the questions customized by level (determined internally)
router.get('/questions/:skill', getDiagnosticQuestionsBySkill);

// Submit each section
router.post('/submit/:skill', submitDiagnosticAssessment);

export default router;
