import { Router } from 'express';
import {
    getMockStatus,
    getMockQuestions,
    getSessionState,
    startMockSection,
    saveMockAnswer,
    submitMock,
} from '../controllers/mockController';

const router = Router();

router.get('/status',                getMockStatus);
router.get('/questions',             getMockQuestions);   // create or resume session → returns section overview
router.get('/session/:sessionId',    getSessionState);    // lazy expiry + current state
router.post('/sections/start',       startMockSection);   // start a section → returns its questions
router.post('/answer',               saveMockAnswer);     // auto-save answer to section row
router.post('/submit',               submitMock);         // submit section; grade when all done

export default router;
