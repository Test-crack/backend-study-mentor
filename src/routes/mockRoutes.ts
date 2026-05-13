import { Router } from 'express';
import { getMockStatus, getMockQuestions, saveMockAnswer, submitMock } from '../controllers/mockController';

const router = Router();

router.get('/status',    getMockStatus);
router.get('/questions', getMockQuestions);   // ?attempt_type=STANDARD|EARNED
router.post('/answer',   saveMockAnswer);
router.post('/submit',   submitMock);

export default router;
