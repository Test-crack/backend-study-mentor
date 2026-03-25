import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { diagnosticQuestionSets, DiagnosticLevel } from '../data/diagnosticQuestions';
import { analyzeWriting } from '../services/ieltsWritingService';
import { analyzeSpeaking } from '../services/ieltsSpeakingService';
import fs from 'fs';

const prisma = new PrismaClient();

/**
 * GET /api/diagnostic/status
 * Fetches the completion status of the diagnostic test from the diagnostic_status view.
 */
export const getDiagnosticStatus = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Find the institute_students ID mapped to this user
    const instituteStudent = await prisma.institute_students.findUnique({
      where: { user_id: userId },
    });

    if (!instituteStudent) {
      // Gracefully handle missing mapping from dev environments
      return res.json({
        isDiagnosed: false,
        listening_scored: false,
        reading_scored: false,
        writing_scored: false,
        speaking_scored: false
      });
    }

    if (instituteStudent.isDiagnosed) {
      return res.json({ 
        isDiagnosed: true, 
        listening_scored: true, 
        reading_scored: true, 
        writing_scored: true, 
        speaking_scored: true,
        overall_complete: true 
      });
    }

    // Query the raw SQL view
    const statusResult: any[] = await prisma.$queryRaw`
      SELECT * FROM "diagnostic_status" WHERE "student_id" = ${instituteStudent.id}::uuid
    `;

    if (statusResult.length === 0) {
      // No rows mean no assessments submitted yet
      return res.json({
        isDiagnosed: false,
        listening_scored: false,
        reading_scored: false,
        writing_scored: false,
        speaking_scored: false,
        overall_complete: false
      });
    }

    res.json({
      isDiagnosed: false,
      ...statusResult[0]
    });
  } catch (error) {
    console.error('[getDiagnosticStatus] Error:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic status' });
  }
};

/**
 * GET /api/diagnostic/questions/:skill
 * Fetches the questions tailored by the student's target band internally.
 */
export const getDiagnosticQuestionsBySkill = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    const { skill } = req.params;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const instituteStudent = await prisma.institute_students.findUnique({
      where: { user_id: userId },
    });

    // Auto-map level based on the band they picked in onboarding
    const targetBand = instituteStudent?.target_band || 7.0;
    let level: DiagnosticLevel = 'B';
    if (targetBand <= 5.5) level = 'A';
    else if (targetBand >= 7.0) level = 'C';

    const data = diagnosticQuestionSets[level];

    // Strip answers
    if (skill === 'listening') {
      return res.json({
        ok: true,
        skill: "listening",
        audio_url: data.listening.audio_url,
        questions: data.listening.questions.map(q => ({ id: q.id, type: q.type, text: q.text, options: q.options }))
      });
    } else if (skill === 'reading') {
      return res.json({
        ok: true,
        skill: "reading",
        passage: data.reading.passage,
        questions: data.reading.questions.map(q => ({ id: q.id, type: q.type, text: q.text, options: q.options }))
      });
    } else if (skill === 'writing') {
      return res.json({
        ok: true,
        skill: "writing",
        ...data.writing
      });
    } else if (skill === 'speaking') {
      return res.json({
        ok: true,
        skill: "speaking",
        ...data.speaking
      });
    } else {
      return res.status(400).json({ error: "Invalid skill parameter" });
    }
  } catch (error) {
    console.error('[getDiagnosticQuestionsBySkill] Error:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic questions' });
  }
};

/**
 * Handles saving to AssessmentHistory and StudentCompetencyMatrix
 */
const saveDiagnosticAssessment = async (
  studentId: string, 
  skill: "LISTENING" | "READING" | "WRITING" | "SPEAKING", 
  bandScore: number, 
  answers: any,
  subScores: any
) => {
  // 1. Create the History log
  const history = await prisma.assessmentHistory.create({
    data: {
      student_id: studentId,
      skill,
      mode: 'DIAGNOSTIC',
      band_score: bandScore,
      raw_answers: answers,
      sub_scores: subScores
    }
  });

  // 2. Upsert the competency matrix
  await prisma.studentCompetencyMatrix.upsert({
    where: {
      student_id_skill: {
        student_id: studentId,
        skill
      }
    },
    update: {
      band_score: bandScore,
      sub_scores: subScores,
      assessments_count: { increment: 1 },
      last_updated: new Date()
    },
    create: {
      student_id: studentId,
      skill,
      band_score: bandScore,
      sub_scores: subScores,
      assessments_count: 1
    }
  });
};

/**
 * POST /api/diagnostic/submit/:skill
 * Submits the diagnostic for a specific skill: listening | reading | writing | speaking
 */
export const submitDiagnosticAssessment = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    const { skill } = req.params; // listening, reading, writing, speaking
    const { level, answers } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const instituteStudent = await prisma.institute_students.findUnique({
      where: { user_id: userId },
    });

    if (!instituteStudent) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const targetBand = instituteStudent?.target_band || 7.0;
    let diagnosticLevel: DiagnosticLevel = 'B';
    if (targetBand <= 5.5) diagnosticLevel = 'A';
    else if (targetBand >= 7.0) diagnosticLevel = 'C';

    const set = diagnosticQuestionSets[diagnosticLevel];

    let bandScore = 0;
    let subScores: any = {};
    const skillUpper = skill.toUpperCase() as "LISTENING" | "READING" | "WRITING" | "SPEAKING";

    // Defensively parse answers in case of proxy stringification/urlencoded issues
    let parsedAnswers = answers;
    if (typeof answers === 'string') {
      try {
        parsedAnswers = JSON.parse(answers);
      } catch (e) {
        parsedAnswers = {};
      }
    }
    parsedAnswers = parsedAnswers || {};

    if (skillUpper === "LISTENING" || skillUpper === "READING") {
      const questions = skillUpper === "LISTENING" ? set.listening.questions : set.reading.questions;
      let correct = 0;
      const total = questions.length;
      
      const questionTypes: Record<string, { correct: number; total: number }> = {};
      
      questions.forEach(q => {
        const type = q.type || 'mcq';
        if (!questionTypes[type]) questionTypes[type] = { correct: 0, total: 0 };
        questionTypes[type].total++;
        
        // Ensure robust matching by trimming whitespace and case-insensitivity
        const studentAns = typeof parsedAnswers[q.id] === 'string' ? parsedAnswers[q.id].trim().toUpperCase() : parsedAnswers[q.id];
        const expectedAns = q.answer_key ? q.answer_key.trim().toUpperCase() : undefined;

        if (studentAns && expectedAns === studentAns) {
          correct++;
          questionTypes[type].correct++;
        }
      });
      
      // Calculate band score proportionally (assuming 9.0 max over 'total' questions)
      bandScore = total > 0 ? (correct / total) * 9 : 0; 
      
      subScores = {
        total_questions: total,
        correct_answers: correct,
        accuracy_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
        by_question_type: questionTypes
      };

    } else if (skillUpper === "WRITING") {
      const wordCount = parsedAnswers.text ? parsedAnswers.text.split(' ').length : 0;
      if (wordCount < 10) {
        bandScore = 0;
        subScores = { word_count: wordCount, error: "Text too short to evaluate" };
      } else {
        const topic = set.writing.topic;
        const analysis = await analyzeWriting(topic, parsedAnswers.text);
        bandScore = Number(analysis.bandScore) || 0;
        subScores = {
          word_count: wordCount,
          grammarScore: analysis.grammarScore,
          vocabularyScore: analysis.vocabularyScore,
          coherenceScore: analysis.coherenceScore,
          taskResponseScore: analysis.taskResponseScore,
          feedback: analysis.detailedFeedback
        };
      }
    } else if (skillUpper === "SPEAKING") {
      bandScore = 6.0;
      subScores = { fluency: 6.0 };
    }

    // Cap at 1 decimal, up to 9.0
    bandScore = Math.min(Math.round(bandScore * 2) / 2, 9.0);

    // Save to DB (AssessmentHistory & StudentCompetencyMatrix)
    await saveDiagnosticAssessment(instituteStudent.id, skillUpper, bandScore, parsedAnswers, subScores);

    // If all 4 are done, mark as diagnosed
    const statusResult: any[] = await prisma.$queryRaw`
      SELECT * FROM "diagnostic_status" WHERE "student_id" = ${instituteStudent.id}::uuid
    `;

    let overallComplete = false;
    if (statusResult.length > 0 && statusResult[0].overall_complete) {
      overallComplete = true;
      await prisma.institute_students.update({
        where: { id: instituteStudent.id },
        data: { isDiagnosed: true }
      });
    }

    res.json({ 
      message: `${skillUpper} diagnostic submitted successfully`, 
      bandScore, 
      overallComplete,
      sub_scores: subScores,
      feedback: subScores?.feedback ? `Improvements: ${subScores.feedback.improvements}` : undefined
    });

  } catch (error) {
    console.error(`[submitDiagnosticAssessment] Error:`, error);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
};

/**
 * POST /api/diagnostic/submit/speaking
 * Handles multipart/form-data specifically for audio payloads.
 */
export const submitDiagnosticSpeaking = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    if (!userId) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const instituteStudent = await prisma.institute_students.findUnique({
      where: { user_id: userId },
    });

    if (!instituteStudent) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Student record not found.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required for speaking diagnostic.' });
    }

    const targetBand = instituteStudent?.target_band || 7.0;
    let diagnosticLevel: DiagnosticLevel = 'B';
    if (targetBand <= 5.5) diagnosticLevel = 'A';
    else if (targetBand >= 7.0) diagnosticLevel = 'C';

    const set = diagnosticQuestionSets[diagnosticLevel];
    const topic = set.speaking.prompts[0] || 'Introduce yourself and describe your hometown.';

    let bandScore = 0;
    let subScores: any = {};
    let transcript = '';

    try {
      const analysis = await analyzeSpeaking(topic, req.file.path, req.file.mimetype || 'audio/webm');
      
      bandScore = Number(analysis.bandScore) || 0;
      bandScore = Math.max(4.0, Math.min(Math.round(bandScore * 2) / 2, 9.0));

      transcript = analysis.transcript;
      subScores = {
        fluencyScore: analysis.fluencyScore,
        vocabularyScore: analysis.vocabularyScore,
        grammarScore: analysis.grammarScore,
        pronunciationScore: analysis.pronunciationScore,
        feedback: analysis.detailedFeedback
      };

    } catch (aiError) {
      console.error('[analyzeSpeaking] Failure:', aiError);
      // Fallback
      bandScore = 6.0;
      subScores = { error: 'Failed to evaluate audio correctly', fallback: true };
    } finally {
      // Clean up the uploaded audio file immediately
      fs.unlink(req.file.path, () => {});
    }

    // Save to Database
    await saveDiagnosticAssessment(instituteStudent.id, "SPEAKING", bandScore, { prompt: topic }, subScores);

    // Check completion
    const statusResult: any[] = await prisma.$queryRaw`
      SELECT * FROM "diagnostic_status" WHERE "student_id" = ${instituteStudent.id}::uuid
    `;
    let overallComplete = false;
    if (statusResult.length > 0 && statusResult[0].overall_complete) {
      overallComplete = true;
      await prisma.institute_students.update({
        where: { id: instituteStudent.id },
        data: { isDiagnosed: true }
      });
    }

    res.json({ 
      message: `SPEAKING diagnostic submitted successfully`, 
      bandScore, 
      overallComplete,
      sub_scores: subScores,
      transcript,
      feedback: subScores?.feedback ? `Improvements: ${subScores.feedback.improvements}` : undefined
    });

  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error(`[submitDiagnosticSpeaking] Error:`, error);
    res.status(500).json({ error: 'Failed to submit speaking assessment' });
  }
};
