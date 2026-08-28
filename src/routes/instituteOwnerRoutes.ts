// src/routes/instituteOwnerRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { requireActiveInstitute } from '../middleware/requireActiveInstitute';
import { attachExamContext } from '../middleware/attachExamContext';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as C from '../controllers/instituteOwnerController';
import { getBatchReadingAnalytics } from '../controllers/readingPracticeController';

const router = Router();
const IO = UserRoleType.INSTITUTE_OWNER;
const IA = UserRoleType.INSTITUTE_ADMIN;

// All routes require authentication + user resolution + an active institute
router.use(requireAuth);
router.use(ensureUser);
router.use(requireActiveInstitute);
router.use(attachExamContext);

// ── Owner-only routes (admin management) ─────────────────────────────────────
router.get('/admins',              authorize(IO), C.getAdmins);
router.post('/admins',             authorize(IO), C.addAdmin);
router.delete('/admins/:userId',   authorize(IO), C.removeAdmin);

// ── Shared operational routes (owner OR admin) ────────────────────────────────
const shared = authorize(IO, IA);

router.get('/my-exams',                                 shared, C.getMyExams);
router.get('/summary',                                  shared, C.getSummary);
router.get('/batches',                                  shared, C.getInstituteBatches);
router.get('/batches/:batchId/dashboard-summary',       shared, C.getOwnerBatchDashboardSummary);
router.get('/students',                                 shared, C.getInstituteStudents);
router.get('/students/:studentId/full-progress',        shared, C.getOwnerStudentFullProgress);
router.post('/students/:studentId/diagnostic/reset',    shared, C.resetStudentDiagnostic);
router.get('/at-risk',                                  shared, C.getInstituteAtRisk);
router.get('/instructors',                              shared, C.getInstituteInstructors);
router.get('/assessment-overview',                      shared, C.getInstituteAssessmentOverview);

// ── Analytics (Phase 2) — shared ─────────────────────────────────────────────
router.get('/analytics/cohort-progress',                shared, C.getAnalyticsCohortProgress);
router.get('/analytics/batch-comparison',               shared, C.getAnalyticsBatchComparison);
router.get('/analytics/instructor-effectiveness',       shared, C.getAnalyticsInstructorEffectiveness);
router.get('/analytics/engagement-trends',              shared, C.getAnalyticsEngagementTrends);
router.get('/analytics/goal-achievement',               shared, C.getAnalyticsGoalAchievement);
router.get('/analytics/subskill-heatmap',               shared, C.getAnalyticsSubskillHeatmap);

// ── Legacy (keep working) ─────────────────────────────────────────────────────
router.get('/batches/:batchId/analytics',               shared, C.getBatchAnalytics);
router.get('/batches/:batchId/reading-analytics',       shared, getBatchReadingAnalytics);

export default router;
