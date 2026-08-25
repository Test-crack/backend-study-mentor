import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { analyzeWriting }  from '../services/ieltsWritingService';
import { analyzeSpeaking } from '../services/ieltsSpeakingService';
import { BAND_MIN, toBand } from '../lib/bandScale';
import { scoreComponent, examProficiencyLevel, provenance, getExamConfig, getScale } from '../exam-engine';
import fs from 'fs';
import { paramStr } from '../utils/httpParams';
import { getVivaRubric } from '../services/viva/registry';
import { gradeResponse, PromptResponseInput } from '../services/viva/pipeline';
import { aggregateViva } from '../services/viva/scoring';
import { CEFR_ORDINAL, CefrLevel, GradedResponse } from '../services/viva/types';

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DiagnosticLevel = 'A' | 'B' | 'C';

// Proficiency level from the exam's config-declared cuts (Phase 6 Part 4a).
function resolveLevel(targetBand: number): DiagnosticLevel {
    return examProficiencyLevel('ielts', targetBand) as DiagnosticLevel;
}

/** Pick one random set_id for the given level + skill. */
async function pickRandomSetId(level: string, skill: string, examId: string): Promise<string | null> {
    // GROUP BY deduplicates set_ids without the DISTINCT+ORDER BY restriction.
    // exam_id scopes to the student's exam (A3): an OET student gets OET sets, not IELTS.
    const rows: any[] = await prisma.$queryRaw`
        SELECT   set_id
        FROM     diagnostic_questions
        WHERE    level     = ${level}
        AND      skill     = ${skill}::"SkillType"
        AND      exam_id   = ${examId}
        AND      is_active = TRUE
        GROUP BY set_id
        ORDER BY RANDOM()
        LIMIT    1
    `;
    return rows[0]?.set_id ?? null;
}

/**
 * Viva prompts come in versions per prompt (sequence). We serve ONE version of each
 * prompt — a randomly-mixed set of N questions — and pin the choice as a compact
 * "version vector" in diagnostic_sessions.set_id, e.g. "v|1:2,2:1,3:1,...". serve and
 * submit both re-read the vector so they agree on exactly what was served.
 */
async function pickVivaVersionVector(examId: string): Promise<string | null> {
    const rows = await prisma.diagnosticQuestion.findMany({
        where: { exam_id: examId, skill: 'SPEAKING', is_active: true },
        select: { sequence: true, options: true },
    });
    if (rows.length === 0) return null;

    const bySeq = new Map<number, number[]>();
    for (const r of rows) {
        const v = Number((r.options as any)?.version ?? 1);
        bySeq.set(r.sequence, [...(bySeq.get(r.sequence) ?? []), v]);
    }
    const picks = [...bySeq.keys()].sort((a, b) => a - b).map((seq) => {
        const versions = bySeq.get(seq)!;
        return `${seq}:${versions[Math.floor(Math.random() * versions.length)]}`;
    });
    return `v|${picks.join(',')}`;
}

/** Resolve the served prompt rows (ordered by sequence) from a pinned version vector. */
async function loadVivaServedRows(examId: string, vector: string) {
    const picks = vector.replace(/^v\|/, '').split(',').filter(Boolean).map((s) => {
        const [seq, ver] = s.split(':').map(Number);
        return { seq, ver };
    });
    const rows = await prisma.diagnosticQuestion.findMany({
        where: { exam_id: examId, skill: 'SPEAKING', is_active: true },
    });
    return picks
        .map((p) => rows.find((r) => r.sequence === p.seq && Number((r.options as any)?.version ?? 1) === p.ver))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .sort((a, b) => a.sequence - b.sequence);
}

/**
 * Server-side pinned served set_id/question_id for a student+skill. First call
 * creates the DiagnosticSession row via `pick`; every call after returns the
 * same value, ignoring anything the client sends. Closes the reroll gap (no
 * more re-picking on a cleared localStorage) and gives submit a value to
 * check the request against instead of trusting it outright.
 */
async function resolveServedId(
    student: { id: string; exam_id: string } | null,
    skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING',
    pick: () => Promise<string | null>,
): Promise<string | null> {
    if (!student) return pick(); // no student row to pin against (submit requires one anyway)

    const existing = await prisma.diagnosticSession.findUnique({
        where: { student_id_exam_id_skill: { student_id: student.id, exam_id: student.exam_id, skill } },
    });
    if (existing) return existing.set_id;

    const picked = await pick();
    if (!picked) return null;

    await prisma.diagnosticSession.create({
        data: { student_id: student.id, exam_id: student.exam_id, skill, set_id: picked },
    });
    return picked;
}

class DiagnosticAlreadyScoredError extends Error {}

// Serializes concurrent submits for the same student+skill so the isSkillAlreadyScored
// check and the save can't both pass for two requests racing each other — the advisory
// lock makes the second request wait for the first's transaction to finish before it
// re-checks. Released automatically when the transaction ends (xact-scoped).
async function lockDiagnosticSkill(tx: Prisma.TransactionClient, studentId: string, skill: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId} || ${skill}))`;
}

// Writes AssessmentHistory + StudentCompetencyMatrix. Takes a tx client —
// caller must run this inside a $transaction, not call it with plain prisma.
async function saveDiagnosticAssessment(
    tx: Prisma.TransactionClient,
    studentId: string,
    skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING',
    bandScore: number,
    answers: any,
    subScores: any,
    examId?: string          // stamp the exam so non-IELTS results aren't left on the 'ielts' default
) {
    const examData = examId ? { exam_id: examId } : {};
    await tx.assessmentHistory.create({
        data: { student_id: studentId, skill, mode: 'DIAGNOSTIC', band_score: bandScore, raw_answers: answers, sub_scores: subScores, ...examData, ...provenance() }
    });
    await tx.studentCompetencyMatrix.upsert({
        where:  { student_id_skill: { student_id: studentId, skill } },
        update: { band_score: bandScore, sub_scores: subScores, assessments_count: { increment: 1 }, last_updated: new Date(), ...examData },
        create: { student_id: studentId, skill, band_score: bandScore, sub_scores: subScores, assessments_count: 1, ...examData }
    });
}

/**
 * Returns true if this skill's diagnostic has already been scored, so a resubmit
 * can be rejected. A diagnostic section is one-time and must never be rewritten.
 */
async function isSkillAlreadyScored(
    studentId: string,
    skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING'
): Promise<boolean> {
    const existing = await prisma.assessmentHistory.findFirst({
        where:  { student_id: studentId, skill, mode: 'DIAGNOSTIC' },
        select: { id: true },
    });
    return !!existing;
}

/**
 * Mark diagnosed once the exam's OWN assessed components are all scored (config-driven).
 * IELTS → [listening, reading, writing, speaking] (4 skills, unchanged). Spoken English →
 * [speaking] only. This replaces the hard-coded 4-skill diagnostic_status view so a
 * speaking-only (or any-shape) exam completes correctly. Exam-aware; is_diagnosed lives
 * on the per-exam InstituteStudent row, so it's already scoped to this student's exam.
 */
async function checkAndMarkDiagnosed(studentId: string, examId: string): Promise<boolean> {
    const cfg: any = getExamConfig(examId);
    const components: string[] = cfg?.overall?.components ?? ['listening', 'reading', 'writing', 'speaking'];
    const requiredSkills = components.map((c) => c.toUpperCase());

    const scored = await prisma.assessmentHistory.findMany({
        where: { student_id: studentId, mode: 'DIAGNOSTIC', skill: { in: requiredSkills as any } },
        select: { skill: true },
        distinct: ['skill'],
    });
    const have = new Set(scored.map((s) => String(s.skill)));

    if (requiredSkills.every((s) => have.has(s))) {
        await prisma.instituteStudent.update({ where: { id: studentId }, data: { isDiagnosed: true } });
        return true;
    }
    return false;
}

// â”€â”€â”€ GET /api/diagnostic/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getDiagnosticStatus = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) return res.json({ isDiagnosed: false, listening_scored: false, reading_scored: false, writing_scored: false, speaking_scored: false });

        // Frontend compares this against what it cached locally — a mismatch means an
        // admin reset happened server-side since the last time it saved progress, and
        // it should discard its cached phase/answers/timer instead of resuming stale state.
        const reset_marker = student.updated_at.toISOString();

        if (student.isDiagnosed) return res.json({ isDiagnosed: true, listening_scored: true, reading_scored: true, writing_scored: true, speaking_scored: true, overall_complete: true, reset_marker });

        const status: any[] = await prisma.$queryRaw`SELECT * FROM "diagnostic_status" WHERE "student_id" = ${student.id}::uuid`;
        if (status.length === 0) return res.json({ isDiagnosed: false, listening_scored: false, reading_scored: false, writing_scored: false, speaking_scored: false, overall_complete: false, reset_marker });

        res.json({ isDiagnosed: false, ...status[0], reset_marker });
    } catch (err) {
        console.error('[getDiagnosticStatus]', err);
        res.status(500).json({ error: 'Failed to fetch diagnostic status' });
    }
};

// â”€â”€â”€ GET /api/diagnostic/questions/:skill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getDiagnosticQuestionsBySkill = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        const skill = paramStr(req.params.skill);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student    = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        const level      = resolveLevel(student?.target_band ?? 7.0);
        const skillUpper = skill.toUpperCase() as 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

        // â”€â”€ LISTENING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'LISTENING') {
            const setId = await resolveServedId(student, 'LISTENING', () => pickRandomSetId(level, 'LISTENING', student?.exam_id ?? 'ielts'));
            if (!setId) return res.status(404).json({ error: 'No listening questions found for this level.' });

            const rows = await prisma.diagnosticQuestion.findMany({
                where:   { set_id: setId, is_active: true },
                orderBy: { sequence: 'asc' }
            });

            return res.json({
                ok:        true,
                skill:     'listening',
                set_id:    setId,
                audio_url: rows[0]?.audio_url ?? null,
                questions: rows.map(q => ({ id: q.id, type: q.question_type.toLowerCase(), text: q.prompt_text, options: q.options }))
            });
        }

        // â”€â”€ READING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'READING') {
            const setId = await resolveServedId(student, 'READING', () => pickRandomSetId(level, 'READING', student?.exam_id ?? 'ielts'));
            if (!setId) return res.status(404).json({ error: 'No reading questions found for this level.' });

            const rows = await prisma.diagnosticQuestion.findMany({
                where:   { set_id: setId, is_active: true },
                orderBy: { sequence: 'asc' }
            });

            return res.json({
                ok:       true,
                skill:    'reading',
                set_id:   setId,
                passage:  rows[0]?.passage_text ?? null,
                questions: rows.map(q => ({ id: q.id, type: q.question_type.toLowerCase(), text: q.prompt_text, options: q.options }))
            });
        }

        // â”€â”€ WRITING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'WRITING') {
            const questionId = await resolveServedId(student, 'WRITING', async () => {
                const rows: any[] = await prisma.$queryRaw`
                    SELECT id FROM diagnostic_questions
                    WHERE  level = ${level} AND skill = 'WRITING'::"SkillType"
                    AND    question_type = 'WRITING_PROMPT' AND is_active = TRUE
                    ORDER  BY RANDOM() LIMIT 1
                `;
                return rows[0]?.id ?? null;
            });
            const row = questionId ? await prisma.diagnosticQuestion.findUnique({ where: { id: questionId } }) : null;
            if (!row) return res.status(404).json({ error: 'No writing prompt found for this level.' });

            return res.json({
                ok:       true,
                skill:    'writing',
                id:       row.id,
                topic:    row.prompt_text,
                minWords: row.min_words ?? 150
            });
        }

        // â”€â”€ SPEAKING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'SPEAKING') {
            const questionId = await resolveServedId(student, 'SPEAKING', async () => {
                const rows: any[] = await prisma.$queryRaw`
                    SELECT id FROM diagnostic_questions
                    WHERE  level = ${level} AND skill = 'SPEAKING'::"SkillType"
                    AND    question_type = 'SPEAKING_PROMPT' AND is_active = TRUE
                    ORDER  BY RANDOM() LIMIT 1
                `;
                return rows[0]?.id ?? null;
            });
            const row = questionId ? await prisma.diagnosticQuestion.findUnique({ where: { id: questionId } }) : null;
            if (!row) return res.status(404).json({ error: 'No speaking prompt found for this level.' });

            return res.json({
                ok:      true,
                skill:   'speaking',
                id:      row.id,
                prompts: [row.prompt_text]   // array shape kept for backward compatibility
            });
        }

        return res.status(400).json({ error: 'Invalid skill parameter' });

    } catch (err) {
        console.error('[getDiagnosticQuestionsBySkill]', err);
        res.status(500).json({ error: 'Failed to fetch diagnostic questions' });
    }
};

// â”€â”€â”€ POST /api/diagnostic/submit/:skill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const submitDiagnosticAssessment = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        const skill = paramStr(req.params.skill);
        const { answers, taskType } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) return res.status(404).json({ error: 'Student record not found.' });

        const skillUpper = skill.toUpperCase() as 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

        // Speaking has its own multipart route (submitDiagnosticSpeaking). This JSON
        // endpoint must never grade speaking â€” a stub here previously assigned a fake
        // band 6.0 with no audio, reachable via encoded paths (%73peaking / U+017F).
        if (skillUpper === 'SPEAKING') {
            return res.status(400).json({ error: 'Speaking must be submitted with audio via /api/diagnostic/submit/speaking.' });
        }

        // Diagnostic is one-time: reject resubmission or any submission after completion.
        if (student.isDiagnosed) {
            return res.status(409).json({ error: 'Diagnostic already completed and cannot be retaken.' });
        }
        if (await isSkillAlreadyScored(student.id, skillUpper)) {
            return res.status(409).json({ error: `The ${skillUpper} section has already been submitted.` });
        }

        let parsedAnswers: any;
        try {
            parsedAnswers = typeof answers === 'string' ? JSON.parse(answers) : (answers ?? {});
        } catch {
            return res.status(400).json({ error: 'Malformed answers payload.' });
        }
        let bandScore = 0;
        let subScores: any = {};

        // â”€â”€ LISTENING / READING â€” grade against the FULL question set â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'LISTENING' || skillUpper === 'READING') {
            const answeredIds = Object.keys(parsedAnswers).filter(k => k.length === 36); // UUID length guard

            // Resolve the fixed set the student was served from the answered question IDs,
            // then grade against EVERY question in that set. The denominator must be the
            // real set size (6 / 4), NOT the number of answers the client chose to send â€”
            // otherwise submitting a single correct answer yields band 9.0.
            const answeredRows = answeredIds.length > 0
                ? await prisma.diagnosticQuestion.findMany({
                    where:  { id: { in: answeredIds }, skill: skillUpper, is_active: true },
                    select: { set_id: true },
                })
                : [];
            // Derive the set STRICTLY from the questions the student actually answered â€”
            // do NOT trust a client-supplied set_id here. Honouring req.body.set_id would
            // let a crafted request point the denominator at a tiny set and answer one
            // question for band 9.0 (a narrower re-open of the very hole this closes).
            let setId: string | null = answeredRows[0]?.set_id ?? null;

            // The derived set must also be the one actually served to this student â€”
            // otherwise answers mixed in from a different (e.g. easier) set would count.
            const session = await prisma.diagnosticSession.findUnique({
                where: { student_id_exam_id_skill: { student_id: student.id, exam_id: student.exam_id, skill: skillUpper } },
            });
            if (setId && session && setId !== session.set_id) setId = null;

            const questions = setId
                ? await prisma.diagnosticQuestion.findMany({ where: { set_id: setId, skill: skillUpper, is_active: true } })
                : [];

            let correct = 0;
            const total = questions.length;
            const byType: Record<string, { correct: number; total: number }> = {};

            questions.forEach(q => {
                const type = q.question_type.toLowerCase();
                if (!byType[type]) byType[type] = { correct: 0, total: 0 };
                byType[type].total++;

                const studentAns = String(parsedAnswers[q.id] ?? '').trim().toUpperCase();
                const expected   = String(q.correct_answer ?? '').trim().toUpperCase();

                if (studentAns && expected && studentAns === expected) {
                    correct++;
                    byType[type].correct++;
                }
            });

            if (total === 0) {
                // Nothing answered, so no set to grade against. Score the floor rather
                // than 400 — a timed-out section must still be submittable.
                bandScore = BAND_MIN;
                subScores = { total_questions: 0, correct_answers: 0, accuracy_percentage: 0, by_question_type: {} };
            } else {
                // Mastery fraction → band, via the engine (config-driven scale for this component).
                bandScore = scoreComponent('ielts', skillUpper.toLowerCase(), { unit: 'raw', correct, total }).value;
                subScores = {
                    total_questions:     total,
                    correct_answers:     correct,
                    accuracy_percentage: Math.round((correct / total) * 100),
                    by_question_type:    byType
                };
            }

        // ── WRITING — fetch prompt by question_id, send to Gemini ─────────────
        } else if (skillUpper === 'WRITING') {
            const wordCount = parsedAnswers.text
                ? parsedAnswers.text.split(/\s+/).filter(Boolean).length
                : 0;

            if (wordCount < 10) {
                // D2: even an empty/trivial attempt scores the IELTS-standard 4.0 floor.
                bandScore = BAND_MIN;
                subScores = { word_count: wordCount, error: 'Text too short to evaluate' };
            } else {
                // The prompt is resolved from what the server actually served this
                // student, not whatever question_id the request carries — a submitted
                // id is never trusted for grading.
                const session = await prisma.diagnosticSession.findUnique({
                    where: { student_id_exam_id_skill: { student_id: student.id, exam_id: student.exam_id, skill: 'WRITING' } },
                });
                const promptRow = session
                    ? await prisma.diagnosticQuestion.findUnique({ where: { id: session.set_id } })
                    : null;

                let topic = 'Describe the information provided.';
                let minWords = 150;
                let resolvedTaskType = taskType ?? 'Task 1';
                if (promptRow) {
                    topic    = promptRow.prompt_text;
                    minWords = (promptRow as any).min_words ?? 150;
                    // Heuristic: Task 2 prompts require 250 words; use that to pick the task type
                    resolvedTaskType = minWords >= 250 ? 'Task 2' : 'Task 1';
                }

                let analysis;
                try {
                    analysis = await analyzeWriting(topic, parsedAnswers.text, resolvedTaskType);
                } catch (aiErr) {
                    // Infra failure â€” do not save a fabricated band; let the student retry.
                    console.error('[analyzeWriting] Failure:', aiErr);
                    return res.status(502).json({ error: 'ai_grading_failed', can_retry: true, message: 'AI evaluation failed. Please try submitting again.' });
                }

                // Enforce the anti-gaming cap server-side (the AI prompt asks for this, but
                // relying on the model alone is unreliable — same reason speaking has hard caps).
                // Cap only the Task Achievement/Response criterion, then re-derive the overall
                // band from the (possibly capped) criteria — capping the already-averaged
                // bandScore a second time double-penalizes essays that are strong elsewhere.
                if (wordCount < minWords) {
                    analysis.taskResponseScore = Math.min(Number(analysis.taskResponseScore) || BAND_MIN, 5.0);
                }
                bandScore = (
                    Number(analysis.taskResponseScore) +
                    Number(analysis.coherenceScore) +
                    Number(analysis.vocabularyScore) +
                    Number(analysis.grammarScore)
                ) / 4;

                subScores = {
                    word_count:        wordCount,
                    min_words:         minWords,
                    task_type:         resolvedTaskType,
                    grammarScore:      analysis.grammarScore,
                    vocabularyScore:   analysis.vocabularyScore,
                    coherenceScore:    analysis.coherenceScore,
                    taskResponseScore: analysis.taskResponseScore,
                    feedback:          analysis.feedback
                };
            }
        }

        // Universal exit gate: round to 0.5 and clamp to [4,9] (adds the previously-missing floor).
        bandScore = toBand(bandScore);
        await prisma.$transaction(async (tx) => {
            await lockDiagnosticSkill(tx, student.id, skillUpper);
            if (await isSkillAlreadyScored(student.id, skillUpper)) throw new DiagnosticAlreadyScoredError();
            await saveDiagnosticAssessment(tx, student.id, skillUpper, bandScore, parsedAnswers, subScores);
        });
        const overallComplete = await checkAndMarkDiagnosed(student.id, student.exam_id);

        res.json({ message: `${skillUpper} diagnostic submitted successfully`, bandScore, overallComplete, sub_scores: subScores, feedback: subScores?.feedback });

    } catch (err) {
        if (err instanceof DiagnosticAlreadyScoredError) {
            return res.status(409).json({ error: `The ${paramStr(req.params.skill).toUpperCase()} section has already been submitted.` });
        }
        console.error('[submitDiagnosticAssessment]', err);
        res.status(500).json({ error: 'Failed to submit assessment' });
    }
};

// â”€â”€â”€ POST /api/diagnostic/submit/speaking (multipart audio) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const submitDiagnosticSpeaking = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        if (!userId) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(401).json({ error: 'Unauthorized' }); }

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Student not found.' }); }
        if (!req.file) return res.status(400).json({ error: 'Audio file required.' });

        // Diagnostic is one-time: reject resubmission or submission after completion.
        if (student.isDiagnosed) {
            fs.unlink(req.file.path, () => {});
            return res.status(409).json({ error: 'Diagnostic already completed and cannot be retaken.' });
        }
        if (await isSkillAlreadyScored(student.id, 'SPEAKING')) {
            fs.unlink(req.file.path, () => {});
            return res.status(409).json({ error: 'The SPEAKING section has already been submitted.' });
        }

        // The prompt is resolved from what the server actually served this student,
        // not the question_id in the request — a submitted id is never trusted for grading.
        const session = await prisma.diagnosticSession.findUnique({
            where: { student_id_exam_id_skill: { student_id: student.id, exam_id: student.exam_id, skill: 'SPEAKING' } },
        });
        const promptRow = session
            ? await prisma.diagnosticQuestion.findUnique({ where: { id: session.set_id } })
            : null;
        const topic = promptRow?.prompt_text ?? 'Introduce yourself and describe your hometown.';

        let bandScore = 0;
        let subScores: any = {};
        let transcript = '';

        try {
            const analysis = await analyzeSpeaking(topic, req.file.path, req.file.mimetype || 'audio/webm');

            // â”€â”€ Edge case: empty audio / pure noise â€” ask student to retry â”€â”€
            if (analysis.needs_retry) {
                fs.unlink(req.file.path, () => {});
                return res.status(422).json({
                    error:      'no_speech_detected',
                    can_retry:  true,
                    message:    'No audible speech was detected in your recording. Please check your microphone and try again.',
                    feedback:   analysis.feedback?.priority_action ?? null,
                });
            }

            // Universal exit gate â€” round 0.5, clamp [4,9]. D2: even weak/invalid
            // graded audio lands on the 4.0 IELTS-standard floor.
            bandScore  = toBand(Number(analysis.bandScore) || BAND_MIN);
            transcript = analysis.transcript ?? '';
            subScores  = {
                content_assessment: analysis.content_assessment,
                fluencyScore:       analysis.fluencyScore,
                vocabularyScore:    analysis.vocabularyScore,
                grammarScore:       analysis.grammarScore,
                pronunciationScore: analysis.pronunciationScore,
                feedback:           analysis.feedback,
            };
        } catch (aiErr) {
            console.error('[analyzeSpeaking] Failure:', aiErr);
            // Real failure (API error, network, etc.) â€” do NOT save a fake 6.0
            fs.unlink(req.file.path, () => {});
            return res.status(502).json({
                error:     'ai_grading_failed',
                can_retry: true,
                message:   'AI evaluation failed. Please try submitting again.',
            });
        } finally {
            // Clean up â€” safe to call even if already unlinked
            try { fs.unlinkSync(req.file.path); } catch { /* already removed */ }
        }

        await prisma.$transaction(async (tx) => {
            await lockDiagnosticSkill(tx, student.id, 'SPEAKING');
            if (await isSkillAlreadyScored(student.id, 'SPEAKING')) throw new DiagnosticAlreadyScoredError();
            await saveDiagnosticAssessment(tx, student.id, 'SPEAKING', bandScore, { prompt: topic, transcript }, subScores);
        });
        const overallComplete = await checkAndMarkDiagnosed(student.id, student.exam_id);

        res.json({ message: 'SPEAKING diagnostic submitted successfully', bandScore, overallComplete, sub_scores: subScores, transcript, feedback: subScores?.feedback });

    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        if (err instanceof DiagnosticAlreadyScoredError) {
            return res.status(409).json({ error: 'The SPEAKING section has already been submitted.' });
        }
        console.error('[submitDiagnosticSpeaking]', err);
        res.status(500).json({ error: 'Failed to submit speaking assessment' });
    }
};

// ─── Config-driven diagnostic VIVA (Spoken English & future viva exams) ──────────
// The viva diagnostic is a multi-prompt, record-and-submit speaking test scored on
// the exam's CEFR scale via the generic viva pipeline. Exam shape (prompts, rubric,
// scale) comes entirely from the viva registry — this controller is exam-agnostic.

/** GET the ordered diagnostic prompt set for the student's current exam. */
export const getDiagnosticVivaPrompts = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) return res.status(404).json({ error: 'Student not found.' });

        const rubric = getVivaRubric(student.exam_id);
        if (!rubric) {
            return res.status(400).json({ error: 'viva_not_configured', message: `No viva rubric configured for exam ${student.exam_id}.` });
        }

        // Prompts are content in diagnostic_questions (skill=SPEAKING), versioned per
        // prompt. Pin one version-per-prompt vector in diagnostic_sessions so re-fetches
        // are stable and submit grades against exactly what we served.
        const vector = await resolveServedId(student, 'SPEAKING', () => pickVivaVersionVector(student.exam_id));
        if (!vector) {
            return res.status(400).json({ error: 'viva_not_seeded', message: `No viva prompts seeded for exam ${student.exam_id}.` });
        }
        const rows = await loadVivaServedRows(student.exam_id, vector);

        res.json({
            examId: student.exam_id,
            alreadyDiagnosed: student.isDiagnosed,
            minWords: rubric.guardrails.minWords,
            // Note: the question wording (prompt_text) is deliberately NOT sent for audio
            // prompts — the student only hears the audio. It's the grader's context only.
            prompts: rows.map((q) => {
                const o = (q.options ?? {}) as any;
                const display = o.display === 'text' ? 'text' : 'audio';
                return {
                    id: q.id,
                    order: q.sequence,
                    type: o.task_type ?? o.type ?? q.question_type,
                    isWarmup: !!o.is_warmup,
                    display,                                            // 'audio' (listen) | 'text' (read aloud)
                    audioUrl: display === 'audio' ? (q.audio_url || null) : null,
                    passage: display === 'text' ? (q.passage_text ?? null) : null,
                    prepSeconds: Number(o.prep_seconds ?? 0),
                    speakSeconds: Number(o.speak_seconds ?? 90),
                };
            }),
        });
    } catch (err) {
        console.error('[getDiagnosticVivaPrompts]', err);
        res.status(500).json({ error: 'Failed to load viva prompts' });
    }
};

/**
 * POST all recorded viva answers (multipart; one audio file per prompt, each file's
 * fieldname = its promptId). Grades every response, aggregates to a CEFR result,
 * stores a DIAGNOSTIC SPEAKING assessment, and marks the student diagnosed for THIS
 * exam. One-time, like the IELTS diagnostic.
 */
export const submitDiagnosticViva = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const cleanup = () => { for (const f of files) { try { fs.unlinkSync(f.path); } catch { /* already removed */ } } };

    try {
        const userId = req.appUserId;
        if (!userId) { cleanup(); return res.status(401).json({ error: 'Unauthorized' }); }

        const student = await prisma.instituteStudent.findUnique({ where: { user_id: userId } });
        if (!student) { cleanup(); return res.status(404).json({ error: 'Student not found.' }); }

        const rubric = getVivaRubric(student.exam_id);
        if (!rubric) { cleanup(); return res.status(400).json({ error: 'viva_not_configured', message: `No viva diagnostic configured for exam ${student.exam_id}.` }); }

        // Diagnostic is one-time: reject resubmission or submission after completion.
        if (student.isDiagnosed) { cleanup(); return res.status(409).json({ error: 'Diagnostic already completed and cannot be retaken.' }); }
        if (await isSkillAlreadyScored(student.id, 'SPEAKING')) { cleanup(); return res.status(409).json({ error: 'The SPEAKING section has already been submitted.' }); }

        if (files.length === 0) return res.status(400).json({ error: 'No audio submitted.', can_retry: true });

        // Grade only against the form we actually served (pinned in diagnostic_sessions).
        const session = await prisma.diagnosticSession.findUnique({
            where: { student_id_exam_id_skill: { student_id: student.id, exam_id: student.exam_id, skill: 'SPEAKING' } },
        });
        if (!session) { cleanup(); return res.status(409).json({ error: 'no_active_viva', can_retry: true, message: 'Load the diagnostic prompts before submitting.' }); }

        const rows = await loadVivaServedRows(student.exam_id, session.set_id);
        const byId = new Map(rows.map((r) => [r.id, r]));

        // Each file's fieldname is a served promptId (diagnostic_question id). Prompt text
        // is resolved server-side from the served row — the client id only selects it, it
        // is never trusted as grading content.
        const inputs: PromptResponseInput[] = [];
        for (const f of files) {
            const row = byId.get(f.fieldname);
            if (!row) continue; // ignore files not matching a served prompt
            const o = (row.options ?? {}) as any;
            inputs.push({
                promptId: row.id,
                isWarmup: !!o.is_warmup,
                audioPath: f.path,
                mimeType: f.mimetype || 'audio/webm',
                promptText: row.prompt_text,
                // e.g. read-aloud rows set options.scored_subskills = ["phonology","fluency"]
                scoredSubskills: Array.isArray(o.scored_subskills) ? o.scored_subskills : undefined,
            });
        }
        if (inputs.length === 0) { cleanup(); return res.status(400).json({ error: 'No recognised prompt audio submitted.', can_retry: true }); }

        // Grade each prompt, then aggregate over the exam's CEFR scale.
        let result;
        try {
            const responses: GradedResponse[] = [];
            for (const input of inputs) responses.push(await gradeResponse(input, rubric));
            const scale = getScale(rubric.scaleId);
            result = aggregateViva(responses, rubric, scale);
        } catch (aiErr) {
            console.error('[submitDiagnosticViva] grading failed:', aiErr);
            cleanup();
            return res.status(502).json({ error: 'ai_grading_failed', can_retry: true, message: 'AI evaluation failed. Please try submitting again.' });
        } finally {
            cleanup();
        }

        // Withheld (≥ guardrail count of no-response prompts) — don't store, ask to retake.
        if (result.status === 'withheld') {
            return res.status(422).json({
                error: 'diagnostic_incomplete', can_retry: true,
                message: 'Diagnostic incomplete — please retake.',
                withholdReason: result.withholdReason, noResponseCount: result.noResponseCount,
            });
        }

        const bandScore = CEFR_ORDINAL[result.cefrLevel as CefrLevel] ?? 0;
        const subScores = {
            cefrLevel: result.cefrLevel,
            cefrLabel: result.cefrLabel,
            meanScore: result.meanScore,
            subskillProfile: result.subskillProfile,
            feedback: result.feedback,
            scoredPromptCount: result.scoredPromptCount,
            noResponseCount: result.noResponseCount,
        };
        const answers = { prompts: inputs.map((i) => ({ promptId: i.promptId, promptText: i.promptText })) };

        await prisma.$transaction(async (tx) => {
            await lockDiagnosticSkill(tx, student.id, 'SPEAKING');
            if (await isSkillAlreadyScored(student.id, 'SPEAKING')) throw new DiagnosticAlreadyScoredError();
            await saveDiagnosticAssessment(tx, student.id, 'SPEAKING', bandScore, answers, subScores, student.exam_id);
        });
        const overallComplete = await checkAndMarkDiagnosed(student.id, student.exam_id);

        res.json({ message: 'Viva diagnostic submitted successfully', overallComplete, result });

    } catch (err) {
        cleanup();
        if (err instanceof DiagnosticAlreadyScoredError) {
            return res.status(409).json({ error: 'The SPEAKING section has already been submitted.' });
        }
        console.error('[submitDiagnosticViva]', err);
        res.status(500).json({ error: 'Failed to submit viva diagnostic' });
    }
};
