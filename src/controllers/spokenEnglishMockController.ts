// Spoken English — Full Mock (parallel flow). The SE mock is a full CEFR speaking run-through:
// one prompt per assessable sub-skill, graded by the SAME viva pipeline as the IA/diagnostic,
// updating the competency matrix and writing a MOCK AssessmentHistory row. Gated (once per month)
// by the shared mock eligibility (>= 6 completed IAs) and tracked via MockSession. The IELTS mock
// controller is untouched. Mirrors spokenEnglishIAController.
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import fs from 'fs';
import { getVivaRubric } from '../services/viva/registry';
import { gradeResponse, PromptResponseInput } from '../services/viva/pipeline';
import { applyGuardrails } from '../services/viva/scoring';
import { getScale, pctToLevel, provenance } from '../exam-engine';
import { CEFR_ORDINAL, CefrLevel, GradedResponse } from '../services/viva/types';

const MOCK_IA_THRESHOLD = 6;      // completed IAs required to unlock the full mock (matches mockController)
const MOCK_WINDOW_HOURS = 24;
const MOCK_MOMENTUM = 100;        // a full mock banks more than an IA (50)

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

const monthYear = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

/** GET /api/mock/se/questions — eligibility + monthly gate, then serve one prompt per sub-skill. */
export async function getSpokenEnglishMock(req: AuthRequest, res: Response) {
    try {
        const userId = (req as any).appUserId as string;
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized.' });
        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

        const rubric = getVivaRubric(student.exam_id);
        if (!rubric) return res.status(400).json({ success: false, error: 'Mock not configured for this exam.' });

        // Baseline profile (diagnostic/last result) — needed for difficulty + smoothing.
        const matrix = await prisma.studentCompetencyMatrix.findFirst({ where: { student_id: student.id, skill: 'SPEAKING' } });
        const sub: any = (matrix?.sub_scores as any) ?? {};
        if (!Array.isArray(sub.subskillProfile) || sub.subskillProfile.length === 0) {
            return res.status(409).json({ success: false, error: 'Complete your diagnostic first.' });
        }
        const difficulty = cefrDifficulty(sub.cefrLevel);

        // Eligibility: >= 6 completed internal assessments (same gate the mock card/status shows).
        const iasDone = await prisma.iASession.count({ where: { student_id: student.id, status: 'COMPLETED' as any } });
        if (iasDone < MOCK_IA_THRESHOLD) {
            return res.status(403).json({ success: false, error: `Complete ${MOCK_IA_THRESHOLD} internal assessments to unlock the mock.`, ia_completed: iasDone, ia_required: MOCK_IA_THRESHOLD });
        }

        // One standard mock per month.
        const my = monthYear();
        const existing = await prisma.mockSession.findUnique({
            where: { student_id_month_year_attempt_type: { student_id: student.id, month_year: my, attempt_type: 'STANDARD' as any } },
        });
        if (existing?.status === 'COMPLETED') {
            return res.status(409).json({ success: false, error: 'You have already taken your full mock this month.' });
        }

        // Serve one prompt per assessable sub-skill (a full run-through across all six).
        const prompts: any[] = [];
        for (const [subId, enumVal] of Object.entries(SUB_TO_ENUM)) {
            const q = await prisma.iAQuestion.findFirst({
                where: { exam_id: student.exam_id, skill: 'SPEAKING', sub_skill: enumVal as any, difficulty, is_active: true, question_type: 'SPEAKING_PROMPT' },
                orderBy: { created_at: 'asc' },
            });
            if (q) prompts.push({ q, subId });
        }
        if (prompts.length === 0) return res.status(409).json({ success: false, error: 'No mock prompts available yet — content is being prepared.' });

        const now = new Date();
        const windowCloses = new Date(now.getTime() + MOCK_WINDOW_HOURS * 3600 * 1000);
        const session = await prisma.mockSession.upsert({
            where: { student_id_month_year_attempt_type: { student_id: student.id, month_year: my, attempt_type: 'STANDARD' as any } },
            update: { question_ids: prompts.map((p) => p.q.id) as any, time_started_at: now, window_closes_at: windowCloses, status: 'IN_PROGRESS' as any },
            create: {
                student_id: student.id, attempt_type: 'STANDARD' as any, month_year: my, status: 'IN_PROGRESS' as any,
                question_ids: prompts.map((p) => p.q.id) as any, time_started_at: now, window_closes_at: windowCloses,
            },
        });

        res.json({
            success: true,
            session_id: session.id,
            examId: student.exam_id,
            prompts: prompts.map(({ q }) => {
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
        console.error('[getSpokenEnglishMock]', err);
        res.status(500).json({ success: false, error: 'Failed to load mock.' });
    }
}

/** POST /api/mock/se/submit — multipart audio per prompt (fieldname = question id). Grade + update. */
export async function submitSpokenEnglishMock(req: AuthRequest, res: Response) {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const cleanup = () => { for (const f of files) { try { fs.unlinkSync(f.path); } catch { /* gone */ } } };
    try {
        const userId = (req as any).appUserId as string;
        if (!userId) { cleanup(); return res.status(401).json({ success: false, error: 'Unauthorized.' }); }
        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) { cleanup(); return res.status(404).json({ success: false, error: 'Student not found.' }); }

        const { session_id } = req.body;
        const session = await prisma.mockSession.findUnique({ where: { id: session_id } });
        if (!session || session.student_id !== student.id) { cleanup(); return res.status(404).json({ success: false, error: 'Session not found.' }); }
        if (session.status === 'COMPLETED') { cleanup(); return res.json({ success: true, already_done: true }); }
        // Enforce the monthly window. SE recordings live only in the browser, so an
        // expired session can't be auto-graded — mark it abandoned (slot consumed),
        // rather than silently accept a late submit. Mirrors the IELTS window guard.
        if (session.window_closes_at && session.window_closes_at.getTime() < Date.now()) {
            cleanup();
            if (session.status !== 'ABANDONED') {
                await prisma.mockSession.update({ where: { id: session.id }, data: { status: 'ABANDONED' as any } });
            }
            return res.status(409).json({ success: false, error: 'This mock session has expired. Your monthly slot has been used.', slot_status: 'ABANDONED' });
        }

        const rubric = getVivaRubric(student.exam_id)!;
        const scale = getScale(rubric.scaleId);
        const rows = await prisma.iAQuestion.findMany({ where: { id: { in: (session.question_ids as string[]) ?? [] } } });
        const byId = new Map(rows.map((r) => [r.id, r]));

        let graded: Array<{ subskillId: string; resp: GradedResponse }> = [];
        try {
            const toGrade = files
                .map((f) => ({ f, row: byId.get(f.fieldname) }))
                .filter((x): x is { f: typeof files[number]; row: NonNullable<typeof x.row> } => !!x.row);
            graded = await Promise.all(toGrade.map(async ({ f, row }) => {
                const o = (row.options ?? {}) as any;
                const input: PromptResponseInput = {
                    promptId: row.id, audioPath: f.path, mimeType: f.mimetype || 'audio/webm',
                    promptText: row.passage_text ? `The student read aloud: "${row.passage_text}"` : row.prompt_text,
                    scoredSubskills: Array.isArray(o.scored_subskills) ? o.scored_subskills : undefined,
                };
                const resp: GradedResponse = await gradeResponse(input, rubric);
                return { subskillId: ENUM_TO_SUB[String(row.sub_skill)], resp };
            }));
        } catch (aiErr) {
            console.error('[submitSpokenEnglishMock] grading failed:', aiErr);
            cleanup();
            return res.status(502).json({ success: false, error: 'AI evaluation failed. Please try again.', can_retry: true });
        } finally { cleanup(); }

        if (graded.length === 0) return res.status(400).json({ success: false, error: 'No recognised answers submitted.' });

        // Apply the SAME rubric guardrails as the IA/diagnostic path (aggregateViva):
        // empty/inaudible/non-English/under-min-words → no usable response; short answer → cap;
        // off-topic → cap the affected subskills. Without this the mock would bank a silent or
        // off-topic recording at whatever raw level the model returned.
        const guarded = graded.map((x) => ({ subskillId: x.subskillId, levels: applyGuardrails(x.resp, rubric) }));
        const noResponseCount = guarded.filter((g) => g.levels === null).length;
        // Too many unusable answers → withhold rather than store a misleading level; leave the
        // session IN_PROGRESS so the student can retake within the window (no slot burned).
        if (noResponseCount >= rubric.guardrails.withholdNoResponseCount) {
            return res.status(422).json({
                success: false,
                error: `We couldn't score enough of your answers (${noResponseCount} of ${guarded.length} had no usable response). Please retake your mock.`,
                withheld: true, can_retry: true,
            });
        }

        // Per assessed sub-skill: mean of its (guardrail-capped) dimension across prompts → CEFR,
        // lightly smoothed (50/50) against the previous score — a mock is a full run-through but
        // still one data point.
        const prev: any = (await prisma.studentCompetencyMatrix.findFirst({ where: { student_id: student.id, skill: 'SPEAKING' } }))?.sub_scores ?? {};
        const profile: any[] = Array.isArray(prev.subskillProfile) ? [...prev.subskillProfile] : [];
        const assessed = [...new Set(guarded.map((g) => g.subskillId))];
        const sectionScores: Array<{ subskill: string; level: string; previous_level: string | null }> = [];
        const storedScores: Array<{ skill: string; sub_skill: string; band: number; correct: number; total: number; ai_graded: boolean; cefr_label: string }> = [];

        for (const subId of assessed) {
            // Only prompts targeting this sub-skill that produced a usable, guardrail-capped level.
            const vals = guarded
                .filter((g) => g.subskillId === subId && g.levels !== null)
                .map((g) => rubric.levelToScore[(g.levels as Record<string, CefrLevel>)[subId]] ?? rubric.levelToScore.below_a1);
            const row = profile.find((p) => p.id === subId);
            // No usable answer for this sub-skill → keep the previous score, don't overwrite with noise.
            if (vals.length === 0) {
                if (row) sectionScores.push({ subskill: subId, level: row.level, previous_level: row.level });
                continue;
            }
            const gradedPct = vals.reduce((a, b) => a + b, 0) / vals.length;
            const prevPct = Number(row?.score ?? gradedPct);
            const smoothed = Math.round((0.5 * prevPct + 0.5 * gradedPct) * 10) / 10;
            const level = (pctToLevel(smoothed, scale) as any) ?? 'b1';
            sectionScores.push({ subskill: subId, level, previous_level: row?.level ?? null });
            storedScores.push({ skill: 'SPEAKING', sub_skill: subId.toUpperCase(), band: CEFR_ORDINAL[level as CefrLevel] ?? 0, correct: 0, total: 0, ai_graded: true, cefr_label: String(level).toUpperCase() });
            if (row) { row.score = smoothed; row.level = level; }
        }

        const meanScore = profile.length ? profile.reduce((a, p) => a + Number(p.score ?? 0), 0) / profile.length : Number(prev.meanScore ?? 0);
        const cefrLevel = String(pctToLevel(meanScore, scale) ?? prev.cefrLevel ?? 'b1');
        const cefrLabel = cefrLevel.toUpperCase();
        const newSubScores = { ...prev, subskillProfile: profile, meanScore, cefrLevel, cefrLabel };
        const bandScore = CEFR_ORDINAL[cefrLevel as CefrLevel] ?? 0;

        await prisma.$transaction(async (tx) => {
            await tx.assessmentHistory.create({
                data: { student_id: student.id, skill: 'SPEAKING', mode: 'MOCK', band_score: bandScore, sub_scores: newSubScores as any, exam_id: student.exam_id, ...provenance() },
            });
            await tx.studentCompetencyMatrix.updateMany({
                where: { student_id: student.id, skill: 'SPEAKING' },
                data: { band_score: bandScore, sub_scores: newSubScores as any, assessments_count: { increment: 1 }, last_updated: new Date() },
            });
            await tx.mockSession.update({
                where: { id: session.id },
                data: { status: 'COMPLETED' as any, time_submitted_at: new Date(), real_band_score: bandScore, momentum_awarded: MOCK_MOMENTUM, scores: storedScores as any },
            });
            await tx.instituteStudent.update({ where: { id: student.id }, data: { momentum_score: { increment: MOCK_MOMENTUM } } });
        });

        res.json({ success: true, cefrLevel, cefrLabel, section_scores: sectionScores, momentum_awarded: MOCK_MOMENTUM });
    } catch (err) {
        cleanup();
        console.error('[submitSpokenEnglishMock]', err);
        res.status(500).json({ success: false, error: 'Failed to submit mock.' });
    }
}
