// src/routes/domainRoutes.ts
import { Router } from 'express';
import * as domainController from '../controllers/domainController';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';

const router = Router();

// Public route to get domains (useful for course creation/filtering)
router.get('/', domainController.getDomains);

// Restricted route to create domains (Instructors and Admins only)
router.post(
    '/',
    requireAuth,
    ensureUser,
    authorize(UserRoleType.INSTRUCTOR, UserRoleType.ADMIN),
    domainController.createDomain
);

export default router;
