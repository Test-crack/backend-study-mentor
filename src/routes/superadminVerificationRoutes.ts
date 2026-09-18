// src/routes/superadminVerificationRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../middleware/ensureUser';
import { authorize } from '../middleware/rbac';
import { UserRoleType } from '@prisma/client';
import * as verificationController from '../controllers/superadminVerificationController';

const router = Router();

// All verification routes: authenticated + SUPERADMIN role only
router.use(requireAuth);
router.use(ensureUser);
router.use(authorize(UserRoleType.SUPERADMIN));

// Small batches only (CSV/JSON question files) — memory storage, no disk writes needed;
// the controller writes its own temp copies for the fs-based verification libraries.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 20 } });

function handleBatchUpload(req: Request, res: Response, next: NextFunction) {
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

// GET  /api/superadmin/verification/coverage
router.get('/coverage', verificationController.getCoverage);

// POST /api/superadmin/verification/layer1              { examId, bankType, expected? } + files[]
router.post('/layer1', handleBatchUpload, verificationController.runLayer1);

// POST /api/superadmin/verification/layer1/report         { examId, bankType, expected? } + files[]  -> colored .xlsx download
router.post('/layer1/report', handleBatchUpload, verificationController.runLayer1Report);

// POST /api/superadmin/verification/tag                  { examId, bankType } + files[1]  -> tagged CSV download
router.post('/tag', handleBatchUpload, verificationController.tagBatch);

// POST /api/superadmin/verification/layer2               { examId, bankType } + files[]  -> { jobId }
// GET  /api/superadmin/verification/layer2/:jobId
// GET  /api/superadmin/verification/layer2/:jobId/report  -> colored .xlsx download (job must be done)
router.post('/layer2', handleBatchUpload, verificationController.startLayer2);
router.get('/layer2/:jobId', verificationController.getLayer2Status);
router.get('/layer2/:jobId/report', verificationController.getLayer2Report);

// POST /api/superadmin/verification/import/plan          { examId, bankType } + files[]  (dry run, never writes)
router.post('/import/plan', handleBatchUpload, verificationController.planImportEndpoint);

// POST /api/superadmin/verification/import/confirm       { examId, bankType, layer2Reviewed } + files[]
router.post('/import/confirm', handleBatchUpload, verificationController.confirmImportEndpoint);

// Diagnostic-only: rollback path for import/confirm's update-in-place writes.
// GET  /api/superadmin/verification/import/backups?setId=...   -> list backup files for a set
// POST /api/superadmin/verification/import/restore              { backupFile, confirm? }  (dry run unless confirm=true)
router.get('/import/backups', verificationController.getDiagnosticImportBackups);
router.post('/import/restore', verificationController.restoreDiagnosticImport);

export default router;
