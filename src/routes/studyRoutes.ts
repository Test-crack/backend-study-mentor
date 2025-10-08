// Routes for youtube transcript extraction and study material generation
import { Router } from 'express';
import { 
  extractTranscript, 
  generateStudyMaterial
} from '../controllers/studyController';

const router = Router();

router.post('/extract', extractTranscript);
router.post('/summarize', generateStudyMaterial);

export default router;
