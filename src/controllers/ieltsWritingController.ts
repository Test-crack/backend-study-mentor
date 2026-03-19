import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { analyzeWriting } from '../services/ieltsWritingService';

const prisma = new PrismaClient();

export const getWritingTasks = async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.ieltsWritingTask.findMany({
      orderBy: { assignedDate: 'desc' }
    });
    
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Error fetching writing tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch writing tasks' });
  }
};

export const submitWriting = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).appUserId;
    const { taskId, content, wordCount } = req.body;

    if (!taskId || !content) {
      return res.status(400).json({ success: false, error: 'Missing taskId or content' });
    }

    const task = await prisma.ieltsWritingTask.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    // AI Analysis
    const analysis = await analyzeWriting(task.topic, content);

    // Save to Database
    const assessment = await prisma.ieltsWritingAssessment.create({
      data: {
        userId,
        taskId,
        writtenContent: content,
        wordCount,
        aiBandScore: String(analysis.bandScore),
        aiGrammarScore: Number(analysis.grammarScore),
        aiVocabularyScore: Number(analysis.vocabularyScore),
        aiCoherenceScore: Number(analysis.coherenceScore),
        aiTaskResponseScore: Number(analysis.taskResponseScore),
        aiFeedbackData: analysis.detailedFeedback
      }
    });

    res.status(201).json({ success: true, data: assessment });
  } catch (error) {
    console.error('Error submitting writing:', error);
    res.status(500).json({ success: false, error: 'Error processing submission' });
  }
};

export const getWritingHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).appUserId;
    const history = await prisma.ieltsWritingAssessment.findMany({
      where: { userId },
      include: { IeltsWritingTask: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching writing history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
};
