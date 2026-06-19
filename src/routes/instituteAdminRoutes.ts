// src/routes/instituteAdminRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as C from '../controllers/instituteOwnerController';

const router = Router();
const IO = UserRoleType.INSTITUTE_OWNER;
const IA = UserRoleType.INSTITUTE_ADMIN;

router.use(requireAuth);
router.use(ensureUser);

// Both roles can call all admin routes (same controller, same endpoints as owner)
const shared = authorize(IA, IO);

router.get('/summary',                                  shared, C.getSummary);
router.get('/batches',                                  shared, C.getInstituteBatches);
router.get('/batches/:batchId/dashboard-summary',       shared, C.getOwnerBatchDashboardSummary);
router.get('/students',                                 shared, C.getInstituteStudents);
router.get('/students/:studentId/full-progress',        shared, C.getOwnerStudentFullProgress);
router.get('/at-risk',                                  shared, C.getInstituteAtRisk);
router.get('/instructors',                              shared, C.getInstituteInstructors);
router.get('/assessment-overview',                      shared, C.getInstituteAssessmentOverview);

// Phase 2 analytics
router.get('/analytics/cohort-progress',                shared, C.getAnalyticsCohortProgress);
router.get('/analytics/batch-comparison',               shared, C.getAnalyticsBatchComparison);
router.get('/analytics/instructor-effectiveness',       shared, C.getAnalyticsInstructorEffectiveness);
router.get('/analytics/engagement-trends',              shared, C.getAnalyticsEngagementTrends);
router.get('/analytics/goal-achievement',               shared, C.getAnalyticsGoalAchievement);
router.get('/analytics/subskill-heatmap',               shared, C.getAnalyticsSubskillHeatmap);

export default router;
