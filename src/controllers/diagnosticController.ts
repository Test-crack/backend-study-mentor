import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { analyzeWriting }  from '../services/ieltsWritingService';
import { analyzeSpeaking } from '../services/ieltsSpeakingService';
import fs from 'fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DiagnosticLevel = 'A' | 'B' | 'C';

function resolveLevel(targetBand: number): DiagnosticLevel {
    if (targetBand <= 5.5) return 'A';
    if (targetBand >= 7.0) return 'C';
    return 'B';
}

/** Pick one random set_id for the given level + skill. */
async function pickRandomSetId(level: string, skill: string): Promise<string | null> {
    const rows: any[] = await prisma.$queryRaw`
        SELECT DISTINCT set_id
        FROM   diagnostic_questions
        WHERE  level     = ${level}
        AND    skill     = ${skill}::"IeltsSkillType"
        AND    is_active = TRUE
        ORDER  BY RANDOM()
        LIMIT  1
    `;
    return rows[0]?.set_id ?? null;
}

/** Shared: write AssessmentHistory + upsert StudentCompetencyMatrix. */
async function saveDiagnosticAssessment(
    studentId: string,
    skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING',
    bandScore: number,
    answers: any,
    subScores: any
) {
    await prisma.assessmentHistory.create({
        data: { student_id: studentId, skill, mode: 'DIAGNOSTIC', band_score: bandScore, raw_answers: answers, sub_scores: subScores }
    });
    await prisma.studentCompetencyMatrix.upsert({
        where:  { student_id_skill: { student_id: studentId, skill } },
        update: { band_score: bandScore, sub_scores: subScores, assessments_count: { increment: 1 }, last_updated: new Date() },
        create: { student_id: studentId, skill, band_score: bandScore, sub_scores: subScores, assessments_count: 1 }
    });
}

/** Mark diagnosed once all 4 skills are done. */
async function checkAndMarkDiagnosed(studentId: string): Promise<boolean> {
    const statusResult: any[] = await prisma.$queryRaw`
        SELECT * FROM "diagnostic_status" WHERE "student_id" = ${studentId}::uuid
    `;
    if (statusResult[0]?.overall_complete) {
        await prisma.institute_students.update({ where: { id: studentId }, data: { isDiagnosed: true } });
        return true;
    }
    return false;
}

// ─── GET /api/diagnostic/status ──────────────────────────────────────────────

export const getDiagnosticStatus = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: userId } });
        if (!student) return res.json({ isDiagnosed: false, listening_scored: false, reading_scored: false, writing_scored: false, speaking_scored: false });

        if (student.isDiagnosed) return res.json({ isDiagnosed: true, listening_scored: true, reading_scored: true, writing_scored: true, speaking_scored: true, overall_complete: true });

        const status: any[] = await prisma.$queryRaw`SELECT * FROM "diagnostic_status" WHERE "student_id" = ${student.id}::uuid`;
        if (status.length === 0) return res.json({ isDiagnosed: false, listening_scored: false, reading_scored: false, writing_scored: false, speaking_scored: false, overall_complete: false });

        res.json({ isDiagnosed: false, ...status[0] });
    } catch (err) {
        console.error('[getDiagnosticStatus]', err);
        res.status(500).json({ error: 'Failed to fetch diagnostic status' });
    }
};

// ─── GET /api/diagnostic/questions/:skill ────────────────────────────────────

export const getDiagnosticQuestionsBySkill = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        const { skill } = req.params;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student    = await prisma.institute_students.findUnique({ where: { user_id: userId } });
        const level      = resolveLevel(student?.target_band ?? 7.0);
        const skillUpper = skill.toUpperCase();

        // ── LISTENING ──────────────────────────────────────────────────────────
        if (skillUpper === 'LISTENING') {
            const setId = await pickRandomSetId(level, 'LISTENING');
            if (!setId) return res.status(404).json({ error: 'No listening questions found for this level.' });

            const rows = await prisma.diagnostic_questions.findMany({
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

        // ── READING ────────────────────────────────────────────────────────────
        if (skillUpper === 'READING') {
            const setId = await pickRandomSetId(level, 'READING');
            if (!setId) return res.status(404).json({ error: 'No reading questions found for this level.' });

            const rows = await prisma.diagnostic_questions.findMany({
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

        // ── WRITING ────────────────────────────────────────────────────────────
        if (skillUpper === 'WRITING') {
            const rows: any[] = await prisma.$queryRaw`
                SELECT id, prompt_text, min_words
                FROM   diagnostic_questions
                WHERE  level         = ${level}
                AND    skill         = 'WRITING'::"IeltsSkillType"
                AND    question_type = 'WRITING_PROMPT'
                AND    is_active     = TRUE
                ORDER  BY RANDOM()
                LIMIT  1
            `;
            if (rows.length === 0) return res.status(404).json({ error: 'No writing prompt found for this level.' });

            return res.json({
                ok:       true,
                skill:    'writing',
                id:       rows[0].id,
                topic:    rows[0].prompt_text,
                minWords: rows[0].min_words ?? 150
            });
        }

        // ── SPEAKING ───────────────────────────────────────────────────────────
        if (skillUpper === 'SPEAKING') {
            const rows: any[] = await prisma.$queryRaw`
                SELECT id, prompt_text
                FROM   diagnostic_questions
                WHERE  level         = ${level}
                AND    skill         = 'SPEAKING'::"IeltsSkillType"
                AND    question_type = 'SPEAKING_PROMPT'
                AND    is_active     = TRUE
                ORDER  BY RANDOM()
                LIMIT  1
            `;
            if (rows.length === 0) return res.status(404).json({ error: 'No speaking prompt found for this level.' });

            return res.json({
                ok:      true,
                skill:   'speaking',
                id:      rows[0].id,
                prompts: [rows[0].prompt_text]   // array shape kept for backward compatibility
            });
        }

        return res.status(400).json({ error: 'Invalid skill parameter' });

    } catch (err) {
        console.error('[getDiagnosticQuestionsBySkill]', err);
        res.status(500).json({ error: 'Failed to fetch diagnostic questions' });
    }
};

// ─── POST /api/diagnostic/submit/:skill ──────────────────────────────────────

export const submitDiagnosticAssessment = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        const { skill } = req.params;
        const { answers, taskType } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const student = await prisma.institute_students.findUnique({ where: { user_id: userId } });
        if (!student) return res.status(404).json({ error: 'Student record not found.' });

        const skillUpper = skill.toUpperCase() as 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

        let parsedAnswers = typeof answers === 'string' ? JSON.parse(answers) : (answers ?? {});
        let bandScore = 0;
        let subScores: any = {};

        // ── LISTENING / READING — re-fetch questions by UUID and grade ─────────
        if (skillUpper === 'LISTENING' || skillUpper === 'READING') {
            const questionIds = Object.keys(parsedAnswers).filter(k => k.length === 36); // UUID length guard
            const questions   = await prisma.diagnostic_questions.findMany({
                where: { id: { in: questionIds }, skill: skillUpper, is_active: true }
            });

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

            bandScore = total > 0 ? (correct / total) * 9 : 0;
            subScores = {
                total_questions:     total,
                correct_answers:     correct,
                accuracy_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
                by_question_type:    byType
            };

        // ── WRITING — fetch prompt by question_id, send to Gemini ─────────────
        } else if (skillUpper === 'WRITING') {
            const wordCount = parsedAnswers.text
                ? parsedAnswers.text.split(/\s+/).filter(Boolean).length
                : 0;

            if (wordCount < 10) {
                bandScore = 0;
                subScores = { word_count: wordCount, error: 'Text too short to evaluate' };
            } else {
                const questionId = parsedAnswers.question_id ?? req.body.question_id;
                let topic = 'Describe the information provided.';
                if (questionId) {
                    const row = await prisma.diagnostic_questions.findUnique({ where: { id: questionId } });
                    if (row) topic = row.prompt_text;
                }
                const analysis = await analyzeWriting(topic, parsedAnswers.text, taskType ?? 'Task 1');
                bandScore = Number(analysis.bandScore) || 0;
                subScores = {
                    word_count:        wordCount,
                    grammarScore:      analysis.grammarScore,
                    vocabularyScore:   analysis.vocabularyScore,
                    coherenceScore:    analysis.coherenceScore,
                    taskResponseScore: analysis.taskResponseScore,
                    feedback:          analysis.feedback
                };
            }

        // ── SPEAKING stub (real path = submitDiagnosticSpeaking below) ─────────
        } else if (skillUpper === 'SPEAKING') {
            bandScore = 6.0;
            subScores = { fluency: 6.0 };
        }

        bandScore = Math.min(Math.round(bandScore * 2) / 2, 9.0);
        await saveDiagnosticAssessment(student.id, skillUpper, bandScore, parsedAnswers, subScores);
        const overallComplete = await checkAndMarkDiagnosed(student.id);

        res.json({ message: `${skillUpper} diagnostic submitted successfully`, bandScore, overallComplete, sub_scores: subScores, feedback: subScores?.feedback });

    } catch (err) {
        console.error('[submitDiagnosticAssessment]', err);
        res.status(500).json({ error: 'Failed to submit assessment' });
    }
};

// ─── POST /api/diagnostic/submit/speaking (multipart audio) ──────────────────

export const submitDiagnosticSpeaking = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
    try {
        const userId = req.appUserId;
        if (!userId) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(401).json({ error: 'Unauthorized' }); }

        const student = await prisma.institute_students.findUnique({ where: { user_id: userId } });
        if (!student) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Student not found.' }); }
        if (!req.file) return res.status(400).json({ error: 'Audio file required.' });

        // Fetch the prompt the student received (frontend sends question_id in FormData)
        const questionId = req.body.question_id;
        let topic = 'Introduce yourself and describe your hometown.';
        if (questionId) {
            const row = await prisma.diagnostic_questions.findUnique({ where: { id: questionId } });
            if (row) topic = row.prompt_text;
        }

        let bandScore = 0;
        let subScores: any = {};
        let transcript = '';

        try {
            const analysis = await analyzeSpeaking(topic, req.file.path, req.file.mimetype || 'audio/webm');
            bandScore  = Math.max(4.0, Math.min(Math.round((Number(analysis.bandScore) || 0) * 2) / 2, 9.0));
            transcript = analysis.transcript;
            subScores  = {
                fluencyScore:      analysis.fluencyScore,
                vocabularyScore:   analysis.vocabularyScore,
                grammarScore:      analysis.grammarScore,
                pronunciationScore: analysis.pronunciationScore,
                feedback:          analysis.feedback
            };
        } catch (aiErr) {
            console.error('[analyzeSpeaking] Failure:', aiErr);
            bandScore = 6.0;
            subScores = { error: 'Failed to evaluate audio', fallback: true };
        } finally {
            fs.unlink(req.file.path, () => {});
        }

        await saveDiagnosticAssessment(student.id, 'SPEAKING', bandScore, { prompt: topic, transcript }, subScores);
        const overallComplete = await checkAndMarkDiagnosed(student.id);

        res.json({ message: 'SPEAKING diagnostic submitted successfully', bandScore, overallComplete, sub_scores: subScores, transcript, feedback: subScores?.feedback });

    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error('[submitDiagnosticSpeaking]', err);
        res.status(500).json({ error: 'Failed to submit speaking assessment' });
    }
};
