import { Request, Response } from 'express';
import assessmentData from '../data/assessmentData.json';
import { getPassageById, getPassageByModuleAndDifficulty, Passage } from '../data/passagesIndex';
import { getModulesList } from '../data/modules';
import { saveAssessmentResults, getUserReadingProfile, getUserAssessmentHistory } from '../services/readingAssessment';
import { AuthRequest } from '../middleware/auth';


// Types
interface Question {
  id: string;
  stem: string;
  options: string[];
  answer: string;
}

interface AssessmentData {
  id: string;
  title: string;
  text: string;
  wordCount: number;
  difficulty: string;
  idealWPM: number;
  questions: Question[];
}

interface SubmitAnswer {
  questionId: string;
  selectedOption: string;
}

interface FocusData {
  focusTime: number;           // Time actually focused
  totalSessionTime: number;    // Total session time
  focusRatio: number;          // Focus ratio (0.0-1.0)
  tabSwitches: number;         // Number of tab switches
}

interface SubmitRequest {
  passageId: string;
  readingTimeSeconds: number;
  answers: SubmitAnswer[];
  focusData: FocusData;
}

interface Metrics {
  weightedWPM: number;
  accuracy: number;
  retention: number;
  speedLearningScore: number;
}

interface IntegrityFlags {
  lowFocusRatio: boolean;
  excessiveTabSwitches: boolean;
  suspiciousBehavior: boolean;
  integrityScore: number;
}

/**
 * Validate focus data and detect suspicious behavior
 */
function validateFocusData(focusData: FocusData): IntegrityFlags {
  const { focusRatio, tabSwitches, totalSessionTime } = focusData;

  // Thresholds for integrity validation
  const MIN_FOCUS_RATIO = 0.6;        // 60% minimum focus ratio
  const MAX_TAB_SWITCHES = 5;          // Maximum 5 tab switches
  const MIN_SESSION_TIME = 20;        // Minimum 20 seconds session time

  const lowFocusRatio = focusRatio < MIN_FOCUS_RATIO;
  const excessiveTabSwitches = tabSwitches > MAX_TAB_SWITCHES;
  const shortSession = totalSessionTime < MIN_SESSION_TIME;

  // Calculate integrity score (0-100)
  let integrityScore = 100;

  if (lowFocusRatio) integrityScore -= 30;
  if (excessiveTabSwitches) integrityScore -= 25;
  if (shortSession) integrityScore -= 20;

  // Additional penalties for extreme cases
  if (focusRatio < 0.3) integrityScore -= 20;  // Very low focus
  if (tabSwitches > 10) integrityScore -= 15;  // Excessive tab switching

  integrityScore = Math.max(0, integrityScore);

  const suspiciousBehavior = integrityScore < 50 ||
    (lowFocusRatio && excessiveTabSwitches) ||
    focusRatio < 0.2;

  return {
    lowFocusRatio,
    excessiveTabSwitches,
    suspiciousBehavior,
    integrityScore
  };
}

/**
 * Adjust metrics based on focus integrity
 */
function adjustMetricsForIntegrity(metrics: Metrics, integrityFlags: IntegrityFlags): Metrics {
  const { integrityScore, suspiciousBehavior } = integrityFlags;

  if (suspiciousBehavior) {
    // Heavy penalty for suspicious behavior
    return {
      weightedWPM: parseFloat((metrics.weightedWPM * 0.5).toFixed(2)),
      accuracy: parseFloat(Math.max(0, metrics.accuracy - 20).toFixed(2)),
      retention: parseFloat(Math.max(0, metrics.retention - 25).toFixed(2)),
      speedLearningScore: parseFloat(Math.max(0, metrics.speedLearningScore - 30).toFixed(2))
    };
  }

  if (integrityScore < 70) {
    // Moderate penalty for low integrity
    const penalty = (70 - integrityScore) / 100;
    return {
      weightedWPM: parseFloat((metrics.weightedWPM * (1 - penalty * 0.3)).toFixed(2)),
      accuracy: parseFloat(Math.max(0, metrics.accuracy - penalty * 10).toFixed(2)),
      retention: parseFloat(Math.max(0, metrics.retention - penalty * 15).toFixed(2)),
      speedLearningScore: parseFloat(Math.max(0, metrics.speedLearningScore - penalty * 20).toFixed(2))
    };
  }

  // No adjustment for good integrity
  return metrics;
}

/**
 * Generate integrity feedback
 */
function generateIntegrityFeedback(integrityFlags: IntegrityFlags): string {
  const { lowFocusRatio, excessiveTabSwitches, suspiciousBehavior, integrityScore } = integrityFlags;

  if (suspiciousBehavior) {
    return "⚠️ Assessment integrity compromised. Please retake the assessment with proper focus and attention.";
  }

  if (lowFocusRatio && excessiveTabSwitches) {
    return "⚠️ Low focus detected with frequent tab switching. Your results may not reflect your true abilities.";
  }

  if (lowFocusRatio) {
    return "⚠️ Low focus ratio detected. Try to minimize distractions for better results.";
  }

  if (excessiveTabSwitches) {
    return "⚠️ Frequent tab switching detected. Please stay focused on the assessment.";
  }

  if (integrityScore < 80) {
    return "ℹ️ Good effort! Try to maintain better focus for optimal results.";
  }

  return "✅ Excellent focus maintained throughout the assessment!";
}

/**
 * Generate personalized feedback based on metrics
 */
function generateFeedback(metrics: Metrics, idealWPM: number, actualWPM: number): string {
  const { accuracy, speedLearningScore } = metrics;

  // Excellent performance
  if (speedLearningScore >= 85 && accuracy >= 80) {
    return 'Excellent work! You have great reading speed and comprehension.';
  }

  // Good speed, needs better comprehension
  if (actualWPM >= idealWPM && accuracy < 70) {
    return 'Good pace, but focus more on key details to improve comprehension.';
  }

  // Good comprehension, slow speed
  if (accuracy >= 80 && actualWPM < idealWPM * 0.8) {
    return 'Great comprehension! Try to increase your reading speed gradually.';
  }

  // Balanced but room for improvement
  if (speedLearningScore >= 60 && speedLearningScore < 85) {
    return 'Good effort! Practice regularly to improve both speed and accuracy.';
  }

  // Needs improvement
  if (speedLearningScore < 60) {
    return 'Take your time to understand the content. Speed will improve with practice.';
  }

  // Default
  return 'Keep practicing to improve your reading skills!';
}


/**
 * GET /api/modules
 * Get all available modules with their metadata
 */
export const getModules = (_req: Request, res: Response) => {
  try {
    const modules = getModulesList();

    res.json({
      modules,
      total: modules.length
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules list' });
  }
};

/**
 * POST /api/passage/random
 * Get a random passage by module and difficulty
 */
export const getRandomPassageController = (req: Request, res: Response) => {
  try {
    // Validate request body exists
    if (!req.body) {
      return res.status(400).json({
        error: 'Both module and difficulty are required'
      });
    }

    const { module, difficulty } = req.body;

    // Validate required fields
    if (!module || !difficulty) {
      return res.status(400).json({
        error: 'Both module and difficulty are required'
      });
    }

    // Validate difficulty
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    const passage = getPassageByModuleAndDifficulty(module, difficulty);

    if (!passage) {
      return res.status(404).json({
        error: 'No passage found for the specified module and difficulty'
      });
    }

    // Remove correct answers from questions
    const sanitizedQuestions = passage.questions.map(({ id, stem, options }) => ({
      id,
      stem,
      options
    }));

    res.json({
      id: passage.id,
      title: passage.title,
      category: passage.category,
      difficulty: passage.difficulty,
      text: passage.text,
      wordCount: passage.wordCount,
      idealWPM: passage.idealWPM,
      estimatedReadingTime: passage.estimatedReadingTime,
      questions: sanitizedQuestions
    });
  } catch (error) {
    console.error('Error fetching random passage:', error);
    res.status(500).json({ error: 'Failed to fetch random passage' });
  }
};



/**
 * POST /api/submit - Enhanced version
 * Calculate metrics and return detailed results including answer review
 */
export const submitAssessment = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Invalid request data' });
    }
    const { passageId, readingTimeSeconds, answers, focusData } = req.body as SubmitRequest;

    // Get userId from authenticated request
    const userId = req.appUserId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate request
    if (!passageId || typeof readingTimeSeconds !== 'number' || !Array.isArray(answers) || !focusData) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Validate focus data structure
    if (typeof focusData.focusRatio !== 'number' ||
      typeof focusData.tabSwitches !== 'number' ||
      typeof focusData.focusTime !== 'number' ||
      typeof focusData.totalSessionTime !== 'number') {
      return res.status(400).json({ error: 'Invalid focus data structure' });
    }

    // Find passage from new library or fall back to old data
    let passage = getPassageById(passageId);
    let data: AssessmentData | Passage;

    if (passage) {
      data = passage;
    } else if (passageId === assessmentData.id) {
      data = assessmentData as AssessmentData;
    } else {
      return res.status(400).json({ error: 'Invalid passage ID' });
    }

    const { wordCount, idealWPM, questions } = data;

    // Validate focus data and check for suspicious behavior
    const integrityFlags = validateFocusData(focusData);

    // If suspicious behavior detected, return early with warning (200 OK but success: false)
    if (integrityFlags.suspiciousBehavior) {
      return res.json({
        success: false,
        reason: "integrity_compromised",
        message: generateIntegrityFeedback(integrityFlags),
        integrityFlags
      });
    }

    // Calculate correct answers and build answer review
    let correctAnswers = 0;
    const answerReview = answers.map(userAnswer => {
      const question = questions.find(q => q.id === userAnswer.questionId);
      const isCorrect = question && question.answer === userAnswer.selectedOption;

      if (isCorrect) {
        correctAnswers++;
      }

      return {
        questionId: userAnswer.questionId,
        selectedOption: userAnswer.selectedOption,
        correctAnswer: question?.answer,
        isCorrect: !!isCorrect
      };
    });

    const totalQuestions = questions.length;

    // Calculate metrics according to specifications

    // 0. Minimum viable Time check - improved logic
    // Calculate minimum time based on realistic reading speeds:
    // - Fast readers: 300-400 WPM (minimum viable)
    // - Average readers: 200-300 WPM 
    // - Slow readers: 100-200 WPM
    // We use 400 WPM as the maximum reasonable speed for comprehension
    const maxReasonableWPM = 400;
    const minTimeSec = Math.ceil((wordCount / maxReasonableWPM) * 60);

    // Additional check: ensure minimum time is at least 20 seconds for any passage
    const absoluteMinTime = Math.max(minTimeSec, 20);

    // Validate reading time
    if (readingTimeSeconds < absoluteMinTime) {
      const suggestedTime = Math.ceil(absoluteMinTime / 60);
      return res.json({
        success: false,
        reason: "too_fast",
        message: `Reading time too short. Please read carefully for at least ${suggestedTime} minute${suggestedTime > 1 ? 's' : ''} to ensure proper comprehension.`,
        suggestedMinTime: absoluteMinTime,
        actualTime: readingTimeSeconds
      });
    }

    // 1. Reading Speed (WPM)
    const wpm = parseFloat((wordCount / (readingTimeSeconds / 60)).toFixed(2));

    // 2. Accuracy (%)
    const accuracy = parseFloat(((correctAnswers / totalQuestions) * 100).toFixed(2));

    // 3. Retention Score (%)
    const speedFactor = Math.min(1, wpm / idealWPM);
    const retention = parseFloat(((accuracy / 100) * speedFactor * 100).toFixed(2));

    // 4. Overall Speed Learning Score (out of 100)
    const speedComponent = Math.min(100, (wpm / idealWPM) * 100);
    const speedLearningScore = parseFloat(((0.6 * accuracy) + (0.4 * speedComponent)).toFixed(2));

    // accuracy - weighted WPM  
    const weightedWPM = parseFloat((wpm * accuracy / 100).toFixed(2));

    const baseMetrics: Metrics = {
      weightedWPM,
      accuracy,
      retention,
      speedLearningScore
    };

    // Adjust metrics based on focus integrity
    const adjustedMetrics = adjustMetricsForIntegrity(baseMetrics, integrityFlags);

    // Generate feedback based on performance
    const performanceFeedback = generateFeedback(adjustedMetrics, idealWPM, wpm);
    const integrityFeedback = generateIntegrityFeedback(integrityFlags);

    // Save to database
    const dbResult = await saveAssessmentResults({
      userId,
      passageInfo: {
        passageId,
        difficulty: data.difficulty,
        category: 'category' in data ? data.category : 'general',
        wordCount
      },
      readingTimeSeconds,
      actualWPM: wpm,
      metrics: adjustedMetrics,
      integrity: {
        focusRatio: focusData.focusRatio,
        integrityScore: integrityFlags.integrityScore,
        tabSwitches: focusData.tabSwitches
      }
    });

    if (!dbResult.success) {
      console.error('Failed to save assessment to database:', dbResult.error);
      // Continue with response even if DB save fails
    }

    res.json({
      metrics: adjustedMetrics,
      baseMetrics, // Original metrics before integrity adjustment
      feedback: performanceFeedback,
      integrityFeedback,
      integrityFlags,
      answerReview,
      passageInfo: {
        id: passageId,
        title: data.title,
        difficulty: data.difficulty
      },
      focusData: {
        focusRatio: parseFloat(focusData.focusRatio.toFixed(2)),
        tabSwitches: focusData.tabSwitches,
        focusTime: parseFloat(focusData.focusTime.toFixed(2)),
        totalSessionTime: parseFloat(focusData.totalSessionTime.toFixed(2))
      },
      // Include new record flags if available
      ...(dbResult.isNewRecord && { isNewRecord: dbResult.isNewRecord })
    });
  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({ error: 'Failed to process submission' });
  }
};



/**
 * GET /api/reading/profile
 * Get user's reading profile with current and best stats
 */
export const getUserProfile = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const profile = await getUserReadingProfile(userId);

    if (!profile) {
      return res.status(404).json({
        error: 'No reading profile found',
        message: 'Complete your first assessment to create a profile'
      });
    }

    res.json({
      profile: {
        current: {
          weightedWPM: profile.currentWeightedWPM,
          retention: profile.currentRetention,
          speedLearning: profile.currentSpeedLearning,
          focusRatio: profile.currentFocusRatio,
          integrityScore: profile.currentIntegrityScore
        },
        best: {
          weightedWPM: profile.highestWeightedWPM,
          retention: profile.highestRetention,
          speedLearning: profile.highestSpeedLearning
        },
        stats: {
          totalAssessments: profile.totalAssessments,
          lastAssessmentAt: profile.lastAssessmentAt
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

/**
 * GET /api/reading/history
 * Get user's assessment history with optional filters
 * Query params: limit, difficulty, days (for date range)
 */
export const getAssessmentHistory = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const difficulty = req.query.difficulty as string | undefined;
    const days = req.query.days ? parseInt(req.query.days as string) : undefined;

    const options: any = { limit };

    if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
      options.difficulty = difficulty;
    }

    if (days) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      options.fromDate = fromDate;
    }

    const history = await getUserAssessmentHistory(userId, options);

    res.json({
      history,
      total: history.length,
      filters: {
        limit,
        difficulty: difficulty || 'all',
        days: days || 'all'
      }
    });
  } catch (error) {
    console.error('Error fetching assessment history:', error);
    res.status(500).json({ error: 'Failed to fetch assessment history' });
  }
};
