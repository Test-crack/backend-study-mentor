import { Request, Response } from 'express';
import prisma from '../lib/prisma';

/**
 * GET /api/voice-lab/prompts
 *
 * Returns all active voice prompts, optionally filtered by band and/or feature.
 *
 * Query params:
 *   ?band=Band%207          — filter to a specific band (optional)
 *   ?feature=anatomy        — filter by feature: 'anatomy', 'resonance', 'both' (optional)
 *
 * Response: { data: IeltsVoicePrompt[] }
 */
export async function getVoicePrompts(req: Request, res: Response) {
    try {
        const { band, feature } = req.query;

        // Build filter: always only return active prompts
        const where: any = { isActive: true };
        if (band && typeof band === 'string') where.band = band;
        if (feature && typeof feature === 'string') {
            // 'both' feature prompts are returned for any feature query
            where.OR = [
                { feature: feature },
                { feature: 'both' },
            ];
        }

        const prompts = await (prisma as any).ieltsVoicePrompt.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                band: true,
                feature: true,
                question: true,
                hint: true,
                targetWpmMin: true,
                targetWpmMax: true,
            },
        });

        res.json({ success: true, data: prompts });
    } catch (error: any) {
        console.error('[voiceLabController] getVoicePrompts error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch voice prompts' });
    }
}

/**
 * GET /api/voice-lab/prompts/random
 *
 * Returns a single random active prompt for the given band.
 * Falls back to any band if none found.
 *
 * Query params:
 *   ?band=Band%207   — required
 *   ?feature=anatomy — optional, defaults to 'anatomy'
 *   ?exclude=id1,id2 — comma-separated IDs to skip (for "New Prompt" UX)
 */
export async function getRandomVoicePrompt(req: Request, res: Response) {
    try {
        const band = (req.query.band as string) || 'Band 7';
        const feature = (req.query.feature as string) || 'anatomy';
        const excludeParam = (req.query.exclude as string) || '';
        const excludeIds = excludeParam ? excludeParam.split(',').filter(Boolean) : [];

        const where: any = {
            isActive: true,
            band,
            OR: [{ feature }, { feature: 'both' }],
        };
        if (excludeIds.length > 0) {
            where.id = { notIn: excludeIds };
        }

        const prompts = await (prisma as any).ieltsVoicePrompt.findMany({
            where,
            select: {
                id: true,
                band: true,
                feature: true,
                question: true,
                hint: true,
                targetWpmMin: true,
                targetWpmMax: true,
            },
        });

        if (prompts.length === 0) {
            // Retry without exclusions (all prompts have been shown)
            const allPrompts = await (prisma as any).ieltsVoicePrompt.findMany({
                where: { isActive: true, band, OR: [{ feature }, { feature: 'both' }] },
                select: { id: true, band: true, feature: true, question: true, hint: true, targetWpmMin: true, targetWpmMax: true },
            });
            if (allPrompts.length === 0) {
                return res.status(404).json({ success: false, error: 'No prompts found for this band' });
            }
            const pick = allPrompts[Math.floor(Math.random() * allPrompts.length)];
            return res.json({ success: true, data: pick });
        }

        const pick = prompts[Math.floor(Math.random() * prompts.length)];
        res.json({ success: true, data: pick });
    } catch (error: any) {
        console.error('[voiceLabController] getRandomVoicePrompt error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch random prompt' });
    }
}
