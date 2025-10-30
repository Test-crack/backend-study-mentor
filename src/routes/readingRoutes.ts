import { Router } from 'express';
import {
  getModules,
  getRandomPassageController,
  submitAssessment
} from '../controllers/readingController';

const router = Router();

// Middleware to log all requests
router.use((req, res, next) => {
  console.log(`[READING ROUTES] ${req.method} ${req.url}`);
  console.log('Request body:', req.body);
  next();
});

// Route definitions
router.get('/modules', getModules);                      // Get list of available modules
router.post('/passage/random', getRandomPassageController);  // Get random passage by module + difficulty
router.post('/submit', submitAssessment);                // Submit assessment answers

// Test route
router.get('/test', (req, res) => {
  console.log('Test route called');
  res.json({ message: 'Reading routes working!' });
});

export default router;
