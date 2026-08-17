import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { analyzeWriting }  from '../services/ieltsWritingService';
import { analyzeSpeaking } from '../services/ieltsSpeakingService';
import { BAND_MIN, toBand, fractionToBand, bandToLevel } from '../lib/bandScale';
import fs from 'fs';
import { paramStr } from '../utils/httpParams';

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DiagnosticLevel = 'A' | 'B' | 'C';

// Even thirds of the [4,9] band domain (D3): A 4.0â€“5.5, B 5.5â€“7.0, C 7.0â€“9.0.
function resolveLevel(targetBand: number): DiagnosticLevel {
    return bandToLevel(targetBand);
}

/** Pick one random set_id for the given level + skill. */
async function pickRandomSetId(level: string, skill: string): Promise<string | null> {
    // GROUP BY deduplicates set_ids without the DISTINCT+ORDER BY restriction
    const rows: any[] = await prisma.$queryRaw`
        SELECT   set_id
        FROM     diagnostic_questions
        WHERE    level     = ${level}
        AND      skill     = ${skill}::"IeltsSkillType"
        AND      is_active = TRUE
        GROUP BY set_id
        ORDER BY RANDOM()
        LIMIT    1
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

/** Mark diagnosed once all 4 skills are done. */
async function checkAndMarkDiagnosed(studentId: string): Promise<boolean> {
    const statusResult: any[] = await prisma.$queryRaw`
        SELECT * FROM "diagnostic_status" WHERE "student_id" = ${studentId}::uuid
    `;
    if (statusResult[0]?.overall_complete) {
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

        if (student.isDiagnosed) return res.json({ isDiagnosed: true, listening_scored: true, reading_scored: true, writing_scored: true, speaking_scored: true, overall_complete: true });

        const status: any[] = await prisma.$queryRaw`SELECT * FROM "diagnostic_status" WHERE "student_id" = ${student.id}::uuid`;
        if (status.length === 0) return res.json({ isDiagnosed: false, listening_scored: false, reading_scored: false, writing_scored: false, speaking_scored: false, overall_complete: false });

        res.json({ isDiagnosed: false, ...status[0] });
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
        const skillUpper = skill.toUpperCase();

        // M-20: a mid-section refresh used to re-roll a random set, silently swapping
        // the questions and wiping the student's saved answers. The client persists the
        // served set_id and passes it back; if it's still valid for this level+skill we
        // re-serve the SAME set. Invalid/absent â†’ fresh random pick as before.
        const requestedSetId = typeof req.query.set_id === 'string' ? req.query.set_id : null;
        const resolveSetId = async (sk: string): Promise<string | null> => {
            if (requestedSetId) {
                const valid = await prisma.diagnosticQuestion.findFirst({
                    where:  { set_id: requestedSetId, level, skill: sk as any, is_active: true },
                    select: { set_id: true },
                });
                if (valid) return requestedSetId;
            }
            return pickRandomSetId(level, sk);
        };

        // â”€â”€ LISTENING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'LISTENING') {
            const setId = await resolveSetId('LISTENING');
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
            const setId = await resolveSetId('READING');
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

        // W/S single-prompt equivalent of resolveSetId: re-serve the same prompt on
        // refresh when the client passes back the question_id it was originally given.
        const requestedQuestionId = typeof req.query.question_id === 'string' ? req.query.question_id : null;

        // â”€â”€ WRITING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'WRITING') {
            let rows: any[] = [];
            if (requestedQuestionId) {
                rows = await prisma.$queryRaw`
                    SELECT id, prompt_text, min_words
                    FROM   diagnostic_questions
                    WHERE  id            = ${requestedQuestionId}::uuid
                    AND    level         = ${level}
                    AND    skill         = 'WRITING'::"IeltsSkillType"
                    AND    question_type = 'WRITING_PROMPT'
                    AND    is_active     = TRUE
                    LIMIT  1
                `;
            }
            if (rows.length === 0) {
                rows = await prisma.$queryRaw`
                    SELECT id, prompt_text, min_words
                    FROM   diagnostic_questions
                    WHERE  level         = ${level}
                    AND    skill         = 'WRITING'::"IeltsSkillType"
                    AND    question_type = 'WRITING_PROMPT'
                    AND    is_active     = TRUE
                    ORDER  BY RANDOM()
                    LIMIT  1
                `;
            }
            if (rows.length === 0) return res.status(404).json({ error: 'No writing prompt found for this level.' });

            return res.json({
                ok:       true,
                skill:    'writing',
                id:       rows[0].id,
                topic:    rows[0].prompt_text,
                minWords: rows[0].min_words ?? 150
            });
        }

        // â”€â”€ SPEAKING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (skillUpper === 'SPEAKING') {
            let rows: any[] = [];
            if (requestedQuestionId) {
                rows = await prisma.$queryRaw`
                    SELECT id, prompt_text
                    FROM   diagnostic_questions
                    WHERE  id            = ${requestedQuestionId}::uuid
                    AND    level         = ${level}
                    AND    skill         = 'SPEAKING'::"IeltsSkillType"
                    AND    question_type = 'SPEAKING_PROMPT'
                    AND    is_active     = TRUE
                    LIMIT  1
                `;
            }
            if (rows.length === 0) {
                rows = await prisma.$queryRaw`
                    SELECT id, prompt_text
                    FROM   diagnostic_questions
                    WHERE  level         = ${level}
                    AND    skill         = 'SPEAKING'::"IeltsSkillType"
                    AND    question_type = 'SPEAKING_PROMPT'
                    AND    is_active     = TRUE
                    ORDER  BY RANDOM()
                    LIMIT  1
                `;
            }
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
            const setId = answeredRows[0]?.set_id ?? null;

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
                return res.status(400).json({ error: 'Could not resolve the question set for grading.' });
            }

            // Mastery fraction â†’ [4,9]: 0 correct = 4.0 floor, all correct = 9.0.
            bandScore = fractionToBand(correct / total);
            subScores = {
                total_questions:     total,
                correct_answers:     correct,
                accuracy_percentage: Math.round((correct / total) * 100),
                by_question_type:    byType
            };

        // â”€â”€ WRITING â€” fetch prompt by question_id, send to Gemini â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (skillUpper === 'WRITING') {
            const wordCount = parsedAnswers.text
                ? parsedAnswers.text.split(/\s+/).filter(Boolean).length
                : 0;

            if (wordCount < 10) {
                // D2: even an empty/trivial attempt scores the IELTS-standard 4.0 floor.
                bandScore = BAND_MIN;
                subScores = { word_count: wordCount, error: 'Text too short to evaluate' };
            } else {
                const questionId = parsedAnswers.question_id ?? req.body.question_id;
                let topic = 'Describe the information provided.';
                if (questionId) {
                    const row = await prisma.diagnosticQuestion.findUnique({ where: { id: questionId } });
                    if (row) topic = row.prompt_text;
                }
                // Resolve the served prompt to get its min_words + task type so caps
                // are enforced against the real requirement, not a hard-coded Task 1.
                let minWords = 150;
                let resolvedTaskType = taskType ?? 'Task 1';
                if (questionId) {
                    const promptRow = await prisma.diagnosticQuestion.findUnique({ where: { id: questionId } });
                    if (promptRow) {
                        topic    = promptRow.prompt_text;
                        minWords = (promptRow as any).min_words ?? 150;
                        // Heuristic: Task 2 prompts require 250 words; use that to pick the task type
                        resolvedTaskType = minWords >= 250 ? 'Task 2' : 'Task 1';
                    }
                }

                let analysis;
                try {
                    analysis = await analyzeWriting(topic, parsedAnswers.text, resolvedTaskType);
                } catch (aiErr) {
                    // Infra failure â€” do not save a fabricated band; let the student retry.
                    console.error('[analyzeWriting] Failure:', aiErr);
                    return res.status(502).json({ error: 'ai_grading_failed', can_retry: true, message: 'AI evaluation failed. Please try submitting again.' });
                }

                bandScore = Number(analysis.bandScore) || BAND_MIN;

                // Enforce anti-gaming caps server-side (the AI prompt asks for these, but
                // relying on the model alone is unreliable â€” same reason speaking has hard caps).
                if (wordCount < minWords) {
                    // Under the required length â†’ Task Achievement capped at 5.0, so the
                    // averaged band cannot exceed 5.0 on length grounds.
                    bandScore = Math.min(bandScore, 5.0);
                }

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
        await saveDiagnosticAssessment(student.id, skillUpper, bandScore, parsedAnswers, subScores);
        const overallComplete = await checkAndMarkDiagnosed(student.id);

        res.json({ message: `${skillUpper} diagnostic submitted successfully`, bandScore, overallComplete, sub_scores: subScores, feedback: subScores?.feedback });

    } catch (err) {
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

        // Fetch the prompt the student received (frontend sends question_id in FormData)
        const questionId = req.body.question_id;
        let topic = 'Introduce yourself and describe your hometown.';
        if (questionId) {
            const row = await prisma.diagnosticQuestion.findUnique({ where: { id: questionId } });
            if (row) topic = row.prompt_text;
        }

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

        await saveDiagnosticAssessment(student.id, 'SPEAKING', bandScore, { prompt: topic, transcript }, subScores);
        const overallComplete = await checkAndMarkDiagnosed(student.id);

        res.json({ message: 'SPEAKING diagnostic submitted successfully', bandScore, overallComplete, sub_scores: subScores, transcript, feedback: subScores?.feedback });

    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error('[submitDiagnosticSpeaking]', err);
        res.status(500).json({ error: 'Failed to submit speaking assessment' });
    }
};
