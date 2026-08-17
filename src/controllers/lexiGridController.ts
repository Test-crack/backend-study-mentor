import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { signLexiGridSession } from '../lib/lexiGridSession';

const WORDS_PER_SESSION = 5;
const VALID_DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
type Difficulty = typeof VALID_DIFFICULTIES[number];

/**
 * GET /api/student/lexigrid-words?difficulty=INTERMEDIATE
 *
 * Returns 5 random active LexiGrid words at the requested difficulty level.
 * Falls back to any difficulty if the requested level has fewer than 5 words.
 * Increments `times_served` on each fetched word (fire-and-forget, non-blocking).
 */
export async function getLexiGridWords(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId as string;
        if (!appUserId) {
            return res.status(401).json({ success: false, error: 'Unauthorized.' });
        }

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: appUserId }, select: { id: true } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const rawDifficulty = ((req.query.difficulty as string) ?? '').toUpperCase();
        const difficulty: Difficulty = (VALID_DIFFICULTIES as readonly string[]).includes(rawDifficulty)
            ? (rawDifficulty as Difficulty)
            : 'INTERMEDIATE';

        // Primary fetch: exact difficulty match
        let words: any[] = await prisma.$queryRaw`
            SELECT id, base_word, target_word, hint, difficulty, target_band
            FROM lexigrid_words
            WHERE is_active = true
              AND difficulty = ${difficulty}
            ORDER BY RANDOM()
            LIMIT 5
        `;

        // Graceful fallback: if the difficulty bucket has fewer than 5 words, pull from any level
        if (words.length < WORDS_PER_SESSION) {
            const needed = WORDS_PER_SESSION - words.length;
            const existingIds: string[] = words.map((w: any) => w.id);

            const extras: any[] = existingIds.length > 0
                ? await prisma.$queryRaw`
                    SELECT id, base_word, target_word, hint, difficulty, target_band
                    FROM lexigrid_words
                    WHERE is_active = true
                      AND id <> ALL(${existingIds}::uuid[])
                    ORDER BY RANDOM()
                    LIMIT ${needed}
                  `
                : await prisma.$queryRaw`
                    SELECT id, base_word, target_word, hint, difficulty, target_band
                    FROM lexigrid_words
                    WHERE is_active = true
                    ORDER BY RANDOM()
                    LIMIT ${needed}
                  `;

            words = [...words, ...extras];
        }

        if (words.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No LexiGrid words available. Please seed the lexigrid_words table.'
            });
        }

        const servedWordIds: string[] = words.map((w: any) => w.id);
        const session_token = signLexiGridSession(student.id, servedWordIds);

        // Fire-and-forget: track word usage for future analytics / rotation logic
        prisma.lexiGridWord
            .updateMany({
                where: { id: { in: servedWordIds } },
                data:  { times_served: { increment: 1 }, updated_at: new Date() }
            })
            .catch((err) => console.error('[LexiGrid] times_served increment failed:', err));

        return res.json({
            success: true,
            data: words,
            difficulty,
            count: words.length,
            session_token,
        });

    } catch (err) {
        console.error('[LexiGrid] getLexiGridWords error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
}
