// src/routes/studentRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import { getStudentBatches } from '../controllers/batchController';
import { getSpeakingHistory, getCompetencyScores } from '../controllers/studentController';
import { getRecommendations } from '../controllers/recommendationController';
import { getNextActionDrill } from '../controllers/drillController';
import { getDailyDrillState, saveGameScore } from '../controllers/gameScoreController';

const router = Router();

// =========================================================================
// TEMPORARY FOR POSTMAN TESTING (No Auth Required)
// =========================================================================
// router.get('/next-action-drill', (req, res, next) => {
//     // We are mocking a specific user ID here for testing.
//     // Replace this string with a valid user UUID from your database!
//     (req as any).appUserId = '69bb7e8c-1d35-4191-83cd-fd625be72b36';
//     next();
// }, getNextActionDrill);
// =========================================================================

// --- REAL AUTH STARTS HERE ---
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.STUDENT));

// GET /api/student/daily-drill-state — Lock/unlock state for the day
router.get('/daily-drill-state', getDailyDrillState);

// POST /api/student/game-score — Record LexiGrid / mini-game completion
router.post('/game-score', saveGameScore);

// GET /api/student/next-action-drill — Next prioritized drill to act on
router.get('/next-action-drill', getNextActionDrill);

// GET /api/student/batches  — enrolled batches with instructors
router.get('/batches', getStudentBatches);

// GET /api/student/speaking-history — Student's own past analytics
router.get('/speaking-history', getSpeakingHistory);

// GET /api/student/competency-scores — Student's competency matrix
router.get('/competency-scores', getCompetencyScores);

// GET /api/student/recommendations — Student's AI recommendations
router.get('/recommendations', getRecommendations);

export default router;
