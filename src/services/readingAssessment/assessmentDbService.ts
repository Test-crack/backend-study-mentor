// src/services/readingAssessment/assessmentDbService.ts
import prisma from "../../lib/prisma";

export interface AssessmentMetrics {
  weightedWPM: number;
  accuracy: number;
  retention: number;
  speedLearningScore: number;
}

export interface AssessmentIntegrity {
  focusRatio: number;
  integrityScore: number;
  tabSwitches: number;
}

export interface PassageInfo {
  passageId: string;
  difficulty: string;
  category: string;
  wordCount: number;
}

export interface SaveAssessmentInput {
  userId: string;
  passageInfo: PassageInfo;
  readingTimeSeconds: number;
  actualWPM: number;
  metrics: AssessmentMetrics;
  integrity: AssessmentIntegrity;
}

export interface SaveAssessmentResult {
  success: boolean;
  historyId?: string;
  profileId?: string;
  isNewRecord?: {
    weightedWPM: boolean;
    retention: boolean;
    speedLearning: boolean;
  };
  error?: string;
}

/**
 * Save assessment results to both history and profile tables
 * Updates profile with current stats and tracks new personal bests
 */
export async function saveAssessmentResults(
  input: SaveAssessmentInput
): Promise<SaveAssessmentResult> {
  try {
    const { userId, passageInfo, readingTimeSeconds, actualWPM, metrics, integrity } = input;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Save to history
      const history = await tx.readingAssessmentHistory.create({
        data: {
          userId,
          passageId: passageInfo.passageId,
          difficulty: passageInfo.difficulty,
          category: passageInfo.category,
          wordCount: passageInfo.wordCount,
          readingTimeSeconds,
          actualWPM,
          weightedWPM: metrics.weightedWPM,
          accuracy: metrics.accuracy,
          retention: metrics.retention,
          speedLearningScore: metrics.speedLearningScore,
          focusRatio: integrity.focusRatio,
          integrityScore: integrity.integrityScore,
          tabSwitches: integrity.tabSwitches,
        },
      });

      // 2. Get or create user profile
      let profile = await tx.userReadingProfile.findUnique({
        where: { userId },
      });

      const isNewRecord = {
        weightedWPM: false,
        retention: false,
        speedLearning: false,
      };

      if (!profile) {
        // First assessment - create profile
        profile = await tx.userReadingProfile.create({
          data: {
            userId,
            currentWeightedWPM: metrics.weightedWPM,
            currentRetention: metrics.retention,
            currentSpeedLearning: metrics.speedLearningScore,
            currentFocusRatio: integrity.focusRatio,
            currentIntegrityScore: integrity.integrityScore,
            highestWeightedWPM: metrics.weightedWPM,
            highestRetention: metrics.retention,
            highestSpeedLearning: metrics.speedLearningScore,
            lastAssessmentAt: new Date(),
            totalAssessments: 1,
          },
        });

        isNewRecord.weightedWPM = true;
        isNewRecord.retention = true;
        isNewRecord.speedLearning = true;
      } else {
        // Update existing profile
        const updates: any = {
          currentWeightedWPM: metrics.weightedWPM,
          currentRetention: metrics.retention,
          currentSpeedLearning: metrics.speedLearningScore,
          currentFocusRatio: integrity.focusRatio,
          currentIntegrityScore: integrity.integrityScore,
          lastAssessmentAt: new Date(),
          totalAssessments: profile.totalAssessments + 1,
        };

        // Check for new personal bests
        if (metrics.weightedWPM > profile.highestWeightedWPM) {
          updates.highestWeightedWPM = metrics.weightedWPM;
          isNewRecord.weightedWPM = true;
        }

        if (metrics.retention > profile.highestRetention) {
          updates.highestRetention = metrics.retention;
          isNewRecord.retention = true;
        }

        if (metrics.speedLearningScore > profile.highestSpeedLearning) {
          updates.highestSpeedLearning = metrics.speedLearningScore;
          isNewRecord.speedLearning = true;
        }

        profile = await tx.userReadingProfile.update({
          where: { userId },
          data: updates,
        });
      }

      return { history, profile, isNewRecord };
    });

    console.log(`✅ Saved assessment for user ${userId} - History ID: ${result.history.id}`);

    return {
      success: true,
      historyId: result.history.id,
      profileId: result.profile.id,
      isNewRecord: result.isNewRecord,
    };
  } catch (error: any) {
    console.error("[AssessmentDbService] Error saving assessment:", error);
    return {
      success: false,
      error: error.message || "Failed to save assessment results",
    };
  }
}

/**
 * Get user's reading profile
 */
export async function getUserReadingProfile(userId: string) {
  try {
    const profile = await prisma.userReadingProfile.findUnique({
      where: { userId },
    });

    return profile;
  } catch (error) {
    console.error("[AssessmentDbService] Error fetching user profile:", error);
    return null;
  }
}

/**
 * Get user's assessment history with optional filters
 */
export async function getUserAssessmentHistory(
  userId: string,
  options?: {
    limit?: number;
    difficulty?: string;
    fromDate?: Date;
  }
) {
  try {
    const where: any = { userId };

    if (options?.difficulty) {
      // difficulty mapping doesn't exist on the new table natively,
      // but keeping it structural for query sake
    }

    if (options?.fromDate) {
      where.createdAt = { gte: options.fromDate };
    }

    // Switch to query the newly created IELTS table instead of the legacy test table
    const history = await prisma.ieltsReadingAssessment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
    });

    // Map the new table schema back to matching the expected frontend properties
    return history.map(item => ({
      id: item.id,
      userId: item.userId,
      passageId: item.reportId,
      passageTitle: item.passageTitle,
      difficulty: 'Medium', // fallback since it's not strictly tracked in IELTS schema
      category: item.category,
      wordCount: item.wordCount,
      readingTimeSeconds: item.readingTimeSeconds,
      actualWPM: item.wpm,
      weightedWPM: item.wpm, // Map wpm to weightedWPM for frontend chart logic
      accuracy: item.accuracy,
      retention: item.retentionScore,
      speedLearningScore: item.speedLearningScore,
      focusRatio: 1, // Focus/integrity metrics aren't tracked on the mobile-friendly IELTS flow
      integrityScore: 100,
      tabSwitches: 0,
      createdAt: item.createdAt,
    }));
  } catch (error) {
    console.error("[AssessmentDbService] Error fetching assessment history:", error);
    return [];
  }
}
