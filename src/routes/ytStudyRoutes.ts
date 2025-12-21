// Routes for youtube transcript extraction and study material generation
import { Router } from 'express';
import { 
  extractTranscript, 
  submitClientTranscript,
  generateStudyMaterial
} from '../controllers/ytStudyController';

const router = Router();

router.post('/extract', extractTranscript);
router.post('/submit-client-transcript', submitClientTranscript);
router.post('/summarize', generateStudyMaterial);

export default router;
