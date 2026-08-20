// src/controllers/examsController.ts
// Serves the client-safe exam-engine config projection (never the raw config).
import { Request, Response } from 'express';
import { listPublicSummaries, listPublicConfigs } from '../exam-engine/publicConfig';

// GET /api/exams/public — unauthenticated. Naming + legal + status only.
export function getPublicExams(_req: Request, res: Response) {
  try {
    return res.json({ data: listPublicSummaries() });
  } catch (err: any) {
    console.error('[Exams] getPublicExams error:', err);
    return res.status(500).json({ error: 'Failed to fetch exams' });
  }
}

// GET /api/exams — authenticated. Full PublicExamConfig[] (scoring stripped).
export function getExams(_req: Request, res: Response) {
  try {
    return res.json({ data: listPublicConfigs() });
  } catch (err: any) {
    console.error('[Exams] getExams error:', err);
    return res.status(500).json({ error: 'Failed to fetch exams' });
  }
}
