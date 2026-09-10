// src/routes/loadoutRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as loadoutController from '../controllers/loadoutController';

const router = Router();

router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.SUPERADMIN));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 20 } });

function handleUpload(req: Request, res: Response, next: NextFunction) {
    upload.array('files')(req, res, (err: any) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'file_too_large', message: 'A file exceeds the 5 MB limit.' });
            }
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
                return res.status(413).json({ error: 'too_many_files', message: 'Too many files in one batch.' });
            }
            return res.status(400).json({ error: 'upload_failed', message: 'File upload failed.' });
        }
        next();
    });
}

// GET  /api/superadmin/loadouts
router.get('/', loadoutController.listLoadouts);

// GET  /api/superadmin/loadouts/:id
router.get('/:id', loadoutController.getLoadout);

// POST /api/superadmin/loadouts/verify   { loadoutId, expected?, requireSourceKey? } + files[]
router.post('/verify', handleUpload, loadoutController.verifyWithLoadout);

// Authoring. Only loadouts created here can be changed — the four reference
// ones are pinned by the parity suite and are refused.
router.post('/verify/report', handleUpload, loadoutController.verifyReport);
router.post('/preview', loadoutController.previewDraft);
router.post('/', loadoutController.saveLoadout);
router.put('/:id', loadoutController.saveLoadout);
router.delete('/:id', loadoutController.deleteLoadout);

export default router;
