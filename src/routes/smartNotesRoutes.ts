// Routes for youtube transcript extraction and study material generation
import { Router } from 'express';
import { 
    uploadNotesController,
    upload
} from '../controllers/smartNotesController';

const router = Router();

// Expect form field name to be 'file'. Adjust if your client uses a different field name.
router.post('/upload', upload.single('file'), uploadNotesController);

export default router;
