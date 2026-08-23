// src/routes/instituteAdminRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { requireActiveInstitute } from '../middleware/requireActiveInstitute';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';

// Read-only analytics — served from the owner controller (shared views)
import * as Owner from '../controllers/instituteOwnerController';

// Write operations — student/tutor onboarding & management
import * as Admin from '../controllers/instituteAdminController';

// Batch CRUD & member assignment
import * as Batch from '../controllers/batchController';

// Recipient-generic notifications (user_notifications table)
import { getUserNotifications, markUserNotificationsRead, dismissUserNotification } from '../controllers/userNotificationController';

const router = Router();
const IO = UserRoleType.INSTITUTE_OWNER;
const IA = UserRoleType.INSTITUTE_ADMIN;

router.use(requireAuth);
router.use(ensureUser);
router.use(requireActiveInstitute);

// Both roles can access all admin routes
const shared = authorize(IA, IO);

// ─── Read-only analytics (owner controller, shared) ───────────────────────────
router.get('/summary',                              shared, Owner.getSummary);
router.get('/at-risk',                              shared, Owner.getInstituteAtRisk);
router.get('/instructors',                          shared, Owner.getInstituteInstructors);
router.get('/assessment-overview',                  shared, Owner.getInstituteAssessmentOverview);
router.get('/students/:studentId/full-progress',    shared, Owner.getOwnerStudentFullProgress);
router.post('/students/:studentId/diagnostic/reset', shared, Owner.resetStudentDiagnostic);
router.get('/batches/:batchId/dashboard-summary',   shared, Owner.getOwnerBatchDashboardSummary);

router.get('/analytics/cohort-progress',            shared, Owner.getAnalyticsCohortProgress);
router.get('/analytics/batch-comparison',           shared, Owner.getAnalyticsBatchComparison);
router.get('/analytics/instructor-effectiveness',   shared, Owner.getAnalyticsInstructorEffectiveness);
router.get('/analytics/engagement-trends',          shared, Owner.getAnalyticsEngagementTrends);
router.get('/analytics/goal-achievement',           shared, Owner.getAnalyticsGoalAchievement);
router.get('/analytics/subskill-heatmap',           shared, Owner.getAnalyticsSubskillHeatmap);

// ─── Students ─────────────────────────────────────────────────────────────────
router.get('/students',                             shared, Admin.getStudents);
// Rich table view (band / trend / streak / momentum / at-risk) — owner handler reused
router.get('/students-overview',                    shared, Owner.getInstituteStudents);
router.post('/students',                            shared, Admin.addStudent);
router.delete('/students/:userId',                  shared, Admin.removeStudent);
router.patch('/students/:userId/status',            shared, Admin.updateStudentStatus);
router.post('/students/:userId/resend-invite',      shared, Admin.resendStudentInvite);

// ─── Tutors ───────────────────────────────────────────────────────────────────
router.get('/tutors',                               shared, Admin.getTutors);
router.post('/tutors',                              shared, Admin.addTutor);
router.delete('/tutors/:userId',                    shared, Admin.removeTutor);

// ─── Batches ──────────────────────────────────────────────────────────────────
router.get('/batches',                              shared, Batch.getBatches);
router.post('/batches',                             shared, Batch.createBatch);
router.get('/batches/:id',                          shared, Batch.getBatchDetail);
router.patch('/batches/:id',                        shared, Batch.updateBatch);
router.delete('/batches/:id',                       shared, Batch.deleteBatch);

// ─── Batch member assignment ───────────────────────────────────────────────────
router.post('/batches/:id/instructors',             shared, Batch.addInstructorToBatch);
router.delete('/batches/:id/instructors/:userId',   shared, Batch.removeInstructorFromBatch);
router.post('/batches/:id/students',                shared, Batch.addStudentToBatch);
router.delete('/batches/:id/students/:userId',      shared, Batch.removeStudentFromBatch);

// ─── Institute profile (Settings page) ────────────────────────────────────────
router.get('/institute',                            shared, Admin.getInstituteProfile);
router.patch('/institute',                          shared, Admin.updateInstituteProfile);

// ─── Onboarding status ("needs attention" dashboard panel) ────────────────────
router.get('/onboarding-status',                    shared, Admin.getOnboardingStatus);

// ─── Notifications (recipient-generic user_notifications) ─────────────────────
router.get('/notifications',                        shared, getUserNotifications);
router.post('/notifications/read',                  shared, markUserNotificationsRead);
router.post('/notifications/:id/dismiss',           shared, dismissUserNotification);

export default router;
