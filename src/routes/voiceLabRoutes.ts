import { Router } from 'express';
import { getVoicePrompts, getRandomVoicePrompt } from '../controllers/voiceLabController';

const router = Router();

// GET /api/voice-lab/prompts           — all active prompts (optional ?band= & ?feature= filter)
router.get('/prompts', getVoicePrompts);

// GET /api/voice-lab/prompts/random    — one random prompt for a band (?band= &exclude= )
router.get('/prompts/random', getRandomVoicePrompt);

export default router;
