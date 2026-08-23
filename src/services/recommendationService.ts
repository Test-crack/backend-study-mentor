import prisma from '../lib/prisma';
import { SkillType, RecommendationLevel } from '@prisma/client';
import { examDifficulty } from '../exam-engine';

/**
 * Helper to map a numeric band score to a RecommendationLevel.
 * Even thirds of the [4,9] band domain (D3): <5.5 / <7.0 / ≥7.0 — the single
 * threshold set shared with diagnostic level (A/B/C) and IA difficulty.
 */
export const getBandLevel = (bandScore: number): RecommendationLevel => {
  return RecommendationLevel[examDifficulty('ielts', bandScore) as keyof typeof RecommendationLevel];
};

/**
 * Service to fetch personalized recommendations for a student across all 4 skills.
 */
export async function getStudentRecommendations(studentId: string, page: number = 1, limit: number = 10) {
  // 1. Fetch current competency scores for this student
  const matrix = await prisma.studentCompetencyMatrix.findMany({
    where: { student_id: studentId }
  });

  const getScore = (skill: SkillType) => {
    const record = matrix.find((m: any) => m.skill === skill);
    return record?.band_score ? Number(record.band_score) : 0;
  };

  // 2. Map scores to levels
  const levels = {
    LISTENING: getBandLevel(getScore(SkillType.LISTENING)),
    READING: getBandLevel(getScore(SkillType.READING)),
    WRITING: getBandLevel(getScore(SkillType.WRITING)),
    SPEAKING: getBandLevel(getScore(SkillType.SPEAKING)),
  };

  const skip = (page - 1) * limit;

  // 3. Query all 4 categories concurrently
  const [listening, reading, writing, speaking, totalCounts] = await Promise.all([
    prisma.recommendationItem.findMany({
      where: { skill_type: SkillType.LISTENING, level: levels.LISTENING, is_active: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.recommendationItem.findMany({
      where: { skill_type: SkillType.READING, level: levels.READING, is_active: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.recommendationItem.findMany({
      where: { skill_type: SkillType.WRITING, level: levels.WRITING, is_active: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.recommendationItem.findMany({
      where: { skill_type: SkillType.SPEAKING, level: levels.SPEAKING, is_active: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    // Fetch total counts for pagination metadata
    prisma.recommendationItem.groupBy({
      by: ['skill_type'],
      where: {
        OR: [
          { skill_type: SkillType.LISTENING, level: levels.LISTENING, is_active: true },
          { skill_type: SkillType.READING, level: levels.READING, is_active: true },
          { skill_type: SkillType.WRITING, level: levels.WRITING, is_active: true },
          { skill_type: SkillType.SPEAKING, level: levels.SPEAKING, is_active: true },
        ]
      },
      _count: { id: true }
    })
  ]);

  // Format pagination metadata
  const totalItems = {
    LISTENING: totalCounts.find(t => t.skill_type === SkillType.LISTENING)?._count.id || 0,
    READING: totalCounts.find(t => t.skill_type === SkillType.READING)?._count.id || 0,
    WRITING: totalCounts.find(t => t.skill_type === SkillType.WRITING)?._count.id || 0,
    SPEAKING: totalCounts.find(t => t.skill_type === SkillType.SPEAKING)?._count.id || 0,
  };

  return {
    success: true,
    levels,
    data: {
      LISTENING: listening,
      READING: reading,
      WRITING: writing,
      SPEAKING: speaking
    },
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: {
        LISTENING: Math.ceil(totalItems.LISTENING / limit),
        READING: Math.ceil(totalItems.READING / limit),
        WRITING: Math.ceil(totalItems.WRITING / limit),
        SPEAKING: Math.ceil(totalItems.SPEAKING / limit),
      }
    }
  };
}
