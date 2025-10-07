// Routes for youtube transcript extraction and study material generation
import { Router } from 'express';
import { 
  extractTranscript, 
} from '../controllers/studyContoller';

const router = Router();

router.post('/extract', extractTranscript);
// router.post('/summarize', generateStudyMaterial);

export default router;
