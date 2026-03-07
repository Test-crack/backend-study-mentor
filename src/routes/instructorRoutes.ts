// src/routes/instructorRoutes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as instructorController from '../controllers/instructorController';
import { getInstructorBatches } from '../controllers/batchController';

import multer from 'multer';
import path from 'path';

const router = Router();

// Configure local temporary storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// All instructor routes require authentication, existence check, and INSTRUCTOR role
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.INSTRUCTOR, UserRoleType.ADMIN));

router.put('/profile', instructorController.updateInstructorProfile);


router.get('/courses', instructorController.getInstructorCourses);
router.post('/courses', instructorController.createInstructorCourse);
router.put('/courses/:id', instructorController.updateInstructorCourse);
router.delete('/courses/:id', instructorController.deleteInstructorCourse);

// Module management routes
router.get('/courses/:courseId/modules', instructorController.getCourseModules);
router.post('/courses/:courseId/modules', instructorController.addCourseModule);
router.put('/courses/:courseId/modules/:moduleId', instructorController.updateCourseModule);
router.delete('/courses/:courseId/modules/:moduleId', instructorController.deleteCourseModule);

// Content management routes
router.get('/courses/:courseId/modules/:moduleId', instructorController.getInstructorModuleContent);
router.post('/courses/:courseId/modules/:moduleId/content', instructorController.addModuleContent);
router.put('/courses/:courseId/modules/:moduleId/content/:contentId', instructorController.updateModuleContent);
router.delete('/courses/:courseId/modules/:moduleId/content/:contentId', instructorController.deleteModuleContent);

// Thumbnail management routes
router.put('/courses/:id/thumbnail', upload.single('thumbnail'), instructorController.uploadCourseThumbnail);
router.delete('/courses/:id/thumbnail', instructorController.removeCourseThumbnail);

// Batch view — read only
router.get('/batches', getInstructorBatches);

// Student Progress
router.get('/students/:studentId/reading-history', instructorController.getStudentReadingHistory);

export default router;

