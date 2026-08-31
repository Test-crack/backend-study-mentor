// Spoken English — Internal Assessment (parallel flow). SE IA is a short speaking
// re-assessment: pick the 2 subskills the student should show improvement on (weakest +
// drill performance, like the IELTS IA carry-forward), serve viva/speaking prompts for
// them, grade with the SAME viva pipeline as the diagnostic, and update the competency
// matrix (CEFR + subskills, lightly smoothed). Reuses IASession + the IA schedule
// (getIAStatus); the IELTS IA controller / processIASession are untouched. See
// docs/spoken-english/SPOKEN-ENGLISH-IA-DATA-REQUIREMENT.md.
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import fs from 'fs';
import { getVivaRubric } from '../services/viva/registry';
import { gradeResponse, PromptResponseInput } from '../services/viva/pipeline';
import { getScale, pctToLevel, provenance } from '../exam-engine';
import { CEFR_ORDINAL, CefrLevel, GradedResponse } from '../services/viva/types';
import { DrillSessionStatus } from '@prisma/client';

const PROMPTS_PER_SUBSKILL = 2;
const IA_WINDOW_HOURS = 24;

// CEFR subskill id ↔ SubSkillType enum (mirror of the frontend spokenEnglishSubskills config).
const SUB_TO_ENUM: Record<string, string> = {
    range: 'VOCABULARY', accuracy: 'GRAMMAR', fluency: 'FLUENCY',
    interaction: 'INTERACTION', coherence: 'COHERENCE', phonology: 'PRONUNCIATION',
};
const ENUM_TO_SUB: Record<string, string> = Object.fromEntries(Object.entries(SUB_TO_ENUM).map(([k, v]) => [v, k]));

const cefrDifficulty = (level?: string): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' => {
    const l = (level || '').toLowerCase();
    if (l.startsWith('c')) return 'ADVANCED';
    if (l.startsWith('b')) return 'INTERMEDIATE';
    return 'BEGINNER';
};

/** GET /api/ia/se/questions — pick 2 subskills + serve their speaking prompts, open an IASession. */
export async function getSpokenEnglishIA(req: AuthRequest, res: Response) {
    try {
        const userId = (req as any).appUserId as string;
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized.' });
        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const rubric = getVivaRubric(student.exam_id);
        if (!rubric) return res.status(400).json({ success: false, error: 'IA not configured for this exam.' });

        // Current CEFR + subskill profile (the diagnostic/last-IA result).
        const matrix = await prisma.studentCompetencyMatrix.findFirst({ where: { student_id: student.id, skill: 'SPEAKING' } });
        const sub: any = (matrix?.sub_scores as any) ?? {};
        const profile: any[] = Array.isArray(sub.subskillProfile) ? sub.subskillProfile : [];
        if (profile.length === 0) return res.status(409).json({ success: false, error: 'Complete your diagnostic first.' });
        const difficulty = cefrDifficulty(sub.cefrLevel);

        // Per-subskill drill accuracy (0..1) — feeds the "can show improvement" weighting.
        const drillAgg = await prisma.drillSession.groupBy({
            by: ['sub_skill'],
            where: { student_id: student.id, skill: 'SPEAKING', status: { in: [DrillSessionStatus.DRILL_DONE, DrillSessionStatus.APPLY_DONE] } },
            _sum: { correct_answers: true, total_questions: true },
        });
        const accByEnum = new Map<string, number>();
        for (const g of drillAgg as any[]) {
            const t = g._sum.total_questions ?? 0;
            accByEnum.set(String(g.sub_skill), t > 0 ? (g._sum.correct_answers ?? 0) / t : 0);
        }

        // Which subskills even have IA prompts seeded for this exam+difficulty.
        const available = new Set(
            (await prisma.iAQuestion.findMany({
                where: { exam_id: student.exam_id, skill: 'SPEAKING', difficulty, is_active: true, question_type: 'SPEAKING_PROMPT' },
                distinct: ['sub_skill'], select: { sub_skill: true },
            })).map((r) => String(r.sub_skill)),
        );

        // Weakness = 0.6·(1 − drill accuracy) + 0.4·(1 − subskill score). Highest first.
        const ranked = profile
            .map((p) => {
                const en = SUB_TO_ENUM[p.id];
                const acc = accByEnum.get(en) ?? 0;
                return { id: p.id, enumVal: en, score: Number(p.score ?? 0), weakness: 0.6 * (1 - acc) + 0.4 * (1 - Math.min(1, Number(p.score ?? 0) / 100)) };
            })
            .filter((r) => r.enumVal && available.has(r.enumVal))
            .sort((a, b) => b.weakness - a.weakness);

        if (ranked.length === 0) return res.status(409).json({ success: false, error: 'No IA prompts available yet — content is being prepared.' });
        const selected = ranked.slice(0, 2);

        // Fetch prompts for the chosen subskills.
        const sections = await Promise.all(selected.map(async (s) => {
            const qs = await prisma.iAQuestion.findMany({
                where: { exam_id: student.exam_id, skill: 'SPEAKING', sub_skill: s.enumVal as any, difficulty, is_active: true, question_type: 'SPEAKING_PROMPT' },
                take: PROMPTS_PER_SUBSKILL,
            });
            return { subskill: s.id, questions: qs };
        }));
        const allQ = sections.flatMap((s) => s.questions);
        if (allQ.length === 0) return res.status(409).json({ success: false, error: 'No IA prompts available yet.' });

        // Open (or reuse today's) IASession.
        const today = new Date();
        const iaDate = new Date(today.toISOString().slice(0, 10));
        const iaCount = await prisma.iASession.count({ where: { student_id: student.id } });
        const windowCloses = new Date(today.getTime() + IA_WINDOW_HOURS * 3600 * 1000);
        const session = await prisma.iASession.upsert({
            where: { student_id_ia_date: { student_id: student.id, ia_date: iaDate } },
            update: {},
            create: {
                student_id: student.id, ia_number: iaCount + 1, ia_date: iaDate, status: 'IN_PROGRESS' as any,
                selected_subskills: selected.map((s) => ({ skill: 'SPEAKING', sub_skill: s.enumVal, id: s.id })) as any,
                question_ids: allQ.map((q) => q.id) as any,
                time_started_at: today, window_closes_at: windowCloses,
            },
        });

        res.json({
            success: true,
            session_id: session.id,
            examId: student.exam_id,
            subskills: selected.map((s) => s.id),
            prompts: allQ.map((q) => {
                const o = (q.options ?? {}) as any;
                const display = o.display === 'text' ? 'text' : 'audio';
                return {
                    id: q.id, subskill: ENUM_TO_SUB[String(q.sub_skill)] ?? String(q.sub_skill),
                    display, audioUrl: display === 'audio' ? (q.audio_url || null) : null,
                    passage: display === 'text' ? (q.passage_text ?? null) : null,
                    prepSeconds: Number(o.prep_seconds ?? 15), speakSeconds: Number(o.speak_seconds ?? 90),
                };
            }),
        });
    } catch (err) {
        console.error('[getSpokenEnglishIA]', err);
        res.status(500).json({ success: false, error: 'Failed to load IA.' });
    }
}

/** POST /api/ia/se/submit — multipart audio per prompt (fieldname = question id). Grade + update. */
export async function submitSpokenEnglishIA(req: AuthRequest, res: Response) {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const cleanup = () => { for (const f of files) { try { fs.unlinkSync(f.path); } catch { /* gone */ } } };
    try {
        const userId = (req as any).appUserId as string;
        if (!userId) { cleanup(); return res.status(401).json({ success: false, error: 'Unauthorized.' }); }
        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) { cleanup(); return res.status(404).json({ success: false, error: 'Student not found.' }); }

        const { session_id } = req.body;
        const session = await prisma.iASession.findUnique({ where: { id: session_id } });
        if (!session || session.student_id !== student.id) { cleanup(); return res.status(404).json({ success: false, error: 'Session not found.' }); }
        if (session.status === 'COMPLETED') { cleanup(); return res.json({ success: true, already_done: true }); }

        const rubric = getVivaRubric(student.exam_id)!;
        const scale = getScale(rubric.scaleId);
        const rows = await prisma.iAQuestion.findMany({ where: { id: { in: (session.question_ids as string[]) ?? [] } } });
        const byId = new Map(rows.map((r) => [r.id, r]));

        // Grade every submitted answer through the viva pipeline.
        const graded: Array<{ subskillId: string; levels: Record<string, CefrLevel> }> = [];
        try {
            for (const f of files) {
                const row = byId.get(f.fieldname);
                if (!row) continue;
                const o = (row.options ?? {}) as any;
                const input: PromptResponseInput = {
                    promptId: row.id, audioPath: f.path, mimeType: f.mimetype || 'audio/webm',
                    promptText: row.passage_text ? `The student read aloud: "${row.passage_text}"` : row.prompt_text,
                    scoredSubskills: Array.isArray(o.scored_subskills) ? o.scored_subskills : undefined,
                };
                const g: GradedResponse = await gradeResponse(input, rubric);
                graded.push({ subskillId: ENUM_TO_SUB[String(row.sub_skill)], levels: (g.levels ?? {}) as Record<string, CefrLevel> });
            }
        } catch (aiErr) {
            console.error('[submitSpokenEnglishIA] grading failed:', aiErr);
            cleanup();
            return res.status(502).json({ success: false, error: 'AI evaluation failed. Please try again.', can_retry: true });
        } finally { cleanup(); }

        if (graded.length === 0) return res.status(400).json({ success: false, error: 'No recognised answers submitted.' });

        // Per assessed subskill: mean of that subskill's dimension across its prompts → CEFR.
        // Light smoothing against the previous score (50/50), then update the profile.
        const prev: any = (await prisma.studentCompetencyMatrix.findFirst({ where: { student_id: student.id, skill: 'SPEAKING' } }))?.sub_scores ?? {};
        const profile: any[] = Array.isArray(prev.subskillProfile) ? [...prev.subskillProfile] : [];
        const assessed = [...new Set(graded.map((g) => g.subskillId))];
        const sectionScores: Array<{ subskill: string; level: string; previous_level: string | null }> = [];

        for (const subId of assessed) {
            const vals = graded.filter((g) => g.subskillId === subId).map((g) => rubric.levelToScore[g.levels[subId]] ?? rubric.levelToScore.below_a1);
            const gradedPct = vals.reduce((a, b) => a + b, 0) / vals.length;
            const row = profile.find((p) => p.id === subId);
            const prevPct = Number(row?.score ?? gradedPct);
            const smoothed = Math.round((0.5 * prevPct + 0.5 * gradedPct) * 10) / 10;
            const level = (pctToLevel(smoothed, scale) as any) ?? 'b1';
            sectionScores.push({ subskill: subId, level, previous_level: row?.level ?? null });
            if (row) { row.score = smoothed; row.level = level; }
        }

        // Recompute the overall CEFR from the (updated) 6-subskill mean.
        const meanScore = profile.length ? profile.reduce((a, p) => a + Number(p.score ?? 0), 0) / profile.length : Number(prev.meanScore ?? 0);
        const cefrLevel = String(pctToLevel(meanScore, scale) ?? prev.cefrLevel ?? 'b1');
        const cefrLabel = cefrLevel.toUpperCase();
        const newSubScores = { ...prev, subskillProfile: profile, meanScore, cefrLevel, cefrLabel };
        const bandScore = CEFR_ORDINAL[cefrLevel as CefrLevel] ?? 0;

        const IA_MOMENTUM = 50;
        await prisma.$transaction(async (tx) => {
            await tx.assessmentHistory.create({
                data: { student_id: student.id, skill: 'SPEAKING', mode: 'INTERNAL_ASSESSMENT', band_score: bandScore, sub_scores: newSubScores as any, exam_id: student.exam_id, ...provenance() },
            });
            await tx.studentCompetencyMatrix.updateMany({
                where: { student_id: student.id, skill: 'SPEAKING' },
                data: { band_score: bandScore, sub_scores: newSubScores as any, assessments_count: { increment: 1 }, last_updated: new Date() },
            });
            await tx.iASession.update({
                where: { id: session.id },
                data: { status: 'COMPLETED' as any, time_submitted_at: new Date(), momentum_awarded: IA_MOMENTUM, scores: { sectionScores, cefrLevel } as any },
            });
            await tx.instituteStudent.update({ where: { id: student.id }, data: { momentum_score: { increment: IA_MOMENTUM } } });
        });

        res.json({ success: true, cefrLevel, cefrLabel, section_scores: sectionScores, momentum_awarded: IA_MOMENTUM });
    } catch (err) {
        cleanup();
        console.error('[submitSpokenEnglishIA]', err);
        res.status(500).json({ success: false, error: 'Failed to submit IA.' });
    }
}
