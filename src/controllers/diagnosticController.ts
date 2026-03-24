import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { diagnosticQuestionSets, DiagnosticLevel } from '../data/diagnosticQuestions';

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
const saveDiagnosticAssessment = async (studentId: string, skill: "LISTENING" | "READING" | "WRITING" | "SPEAKING", bandScore: number, answers: any) => {
  // 1. Create the History log
  await prisma.assessmentHistory.create({
    data: {
      student_id: studentId,
      skill,
      mode: 'DIAGNOSTIC',
      band_score: bandScore,
      raw_answers: answers
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
      assessments_count: { increment: 1 },
      last_updated: new Date()
    },
    create: {
      student_id: studentId,
      skill,
      band_score: bandScore,
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

    const diagnosticLevel: DiagnosticLevel = (['A', 'B', 'C'].includes(level)) ? level : 'A';
    const set = diagnosticQuestionSets[diagnosticLevel];

    let bandScore = 0;
    const skillUpper = skill.toUpperCase() as "LISTENING" | "READING" | "WRITING" | "SPEAKING";

    if (skillUpper === "LISTENING" || skillUpper === "READING") {
      // Basic grading logic
      const questions = skillUpper === "LISTENING" ? set.listening.questions : set.reading.questions;
      let correct = 0;
      
      // answers should be an object mapping question ID to selected option string
      Object.keys(answers).forEach(qId => {
        const q = questions.find(question => question.id === qId);
        if (q && q.answer_key === answers[qId]) {
          correct++;
        }
      });
      
      // very basic score mapping for 6 questions
      bandScore = (correct / 6) * 9; 
    } else if (skillUpper === "WRITING") {
      // mock write grading
      const wordCount = answers.text ? answers.text.split(' ').length : 0;
      bandScore = wordCount > 150 ? 6.5 : 4.5;
    } else if (skillUpper === "SPEAKING") {
      // mock speaking grading
      bandScore = 6.0;
    }

    // Cap at 1 decimal, up to 9.0
    bandScore = Math.min(Math.round(bandScore * 2) / 2, 9.0);

    await saveDiagnosticAssessment(instituteStudent.id, skillUpper, bandScore, answers);

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

    res.json({ message: `${skillUpper} diagnostic submitted successfully`, bandScore, overallComplete });

  } catch (error) {
    console.error(`[submitDiagnosticAssessment] Error:`, error);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
};
