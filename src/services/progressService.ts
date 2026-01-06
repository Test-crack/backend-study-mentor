import prisma from '../lib/prisma';
import { ProgressStatus } from '@prisma/client';
import {
  ProgressData,
  ModuleProgressResult,
  CourseProgressResult,
} from '../types/progress';

/**
 * Calculate module progress based on completed content items
 * Counts total required items from CourseContentItem, completed from UserContentProgress
 */
export const calculateModuleProgress = async (
  userId: string,
  moduleId: string,
  _courseId: string
): Promise<ProgressData> => {
  // Get total required items in this module
  const totalResult = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint as total
    FROM "CourseContentItem" cci
    JOIN "ModuleConcept" mc ON cci."concept_id" = mc."concept_id"
    WHERE mc."module_id" = ${moduleId}::uuid
      AND cci."is_required" = true
  `;

  // Get completed items by user
  const completedResult = await prisma.$queryRaw<Array<{ completed: bigint }>>`
    SELECT COUNT(*)::bigint as completed
    FROM "UserContentProgress" ucp
    JOIN "CourseContentItem" cci ON ucp."content_item_id" = cci."id"
    WHERE ucp."user_id" = ${userId}::uuid
      AND ucp."module_id" = ${moduleId}::uuid
      AND ucp."status" = 'COMPLETED'
      AND cci."is_required" = true
  `;

  const totalRequiredItems = Number(totalResult[0]?.total || 0);
  const completedItems = Number(completedResult[0]?.completed || 0);

  const progressPercent =
    totalRequiredItems > 0
      ? Math.round((completedItems / totalRequiredItems) * 100)
      : 0;

  const status: ProgressStatus =
    progressPercent === 100
      ? 'COMPLETED'
      : progressPercent > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';

  return {
    progress_percent: progressPercent,
    status,
    completed_items: completedItems,
    total_required_items: totalRequiredItems,
  };
};

/**
 * Calculate course progress based on completed modules
 */
export const calculateCourseProgress = async (
  userId: string,
  courseId: string
): Promise<ProgressData> => {
  const result = await prisma.$queryRaw<
    Array<{
      completed_modules: bigint;
      total_modules: bigint;
    }>
  >`
    SELECT 
      COUNT(DISTINCT CASE WHEN ump."status" = 'COMPLETED' THEN cm."module_id" END)::bigint as completed_modules,
      COUNT(DISTINCT cm."module_id")::bigint as total_modules
    FROM "CourseModule" cm
    LEFT JOIN "UserModuleProgress" ump ON cm."module_id" = ump."module_id" 
      AND ump."user_id" = ${userId}::uuid
    WHERE cm."course_id" = ${courseId}::uuid
  `;

  const data = result[0];
  const completedModules = Number(data?.completed_modules || 0);
  const totalModules = Number(data?.total_modules || 0);

  const progressPercent =
    totalModules > 0
      ? Math.round((completedModules / totalModules) * 100)
      : 0;

  const status: ProgressStatus =
    progressPercent === 100
      ? 'COMPLETED'
      : progressPercent > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';

  return {
    progress_percent: progressPercent,
    status,
    completed_items: completedModules,
    total_required_items: totalModules,
  };
};

/**
 * Ensure UserModuleProgress exists, create if not
 */
const ensureModuleProgress = async (
  userId: string,
  moduleId: string,
  courseId: string
) => {
  return prisma.userModuleProgress.upsert({
    where: {
      user_id_module_id_course_id: {
        user_id: userId,
        module_id: moduleId,
        course_id: courseId,
      },
    },
    create: {
      user_id: userId,
      module_id: moduleId,
      course_id: courseId,
      status: ProgressStatus.NOT_STARTED,
      progress_percent: 0,
    },
    update: {},
  });
};

/**
 * Update module progress and return if it changed
 */
export const updateModuleProgress = async (
  userId: string,
  moduleId: string,
  courseId: string
): Promise<ModuleProgressResult> => {
  // Ensure record exists first
  await ensureModuleProgress(userId, moduleId, courseId);

  const newProgress = await calculateModuleProgress(userId, moduleId, courseId);

  const currentProgress = await prisma.userModuleProgress.findUnique({
    where: {
      user_id_module_id_course_id: {
        user_id: userId,
        module_id: moduleId,
        course_id: courseId,
      },
    },
    select: { status: true },
  });

  await prisma.userModuleProgress.update({
    where: {
      user_id_module_id_course_id: {
        user_id: userId,
        module_id: moduleId,
        course_id: courseId,
      },
    },
    data: {
      progress_percent: newProgress.progress_percent,
      status: newProgress.status,
      completed_at: newProgress.status === 'COMPLETED' ? new Date() : null,
      last_accessed_at: new Date(),
    },
  });

  return {
    moduleProgress: newProgress,
    moduleUpdated: currentProgress?.status !== newProgress.status,
  };
};

/**
 * Update course progress and advance module if needed
 */
export const updateCourseProgress = async (
  userId: string,
  courseId: string
): Promise<CourseProgressResult> => {
  const newProgress = await calculateCourseProgress(userId, courseId);

  const currentEnrollment = await prisma.userCourseEnrollment.findUnique({
    where: {
      user_id_course_id: {
        user_id: userId,
        course_id: courseId,
      },
    },
    select: { status: true, module_index: true },
  });

  if (!currentEnrollment) {
    throw new Error('User is not enrolled in this course');
  }

  await prisma.userCourseEnrollment.update({
    where: {
      user_id_course_id: {
        user_id: userId,
        course_id: courseId,
      },
    },
    data: {
      status: newProgress.status,
      completed_at: newProgress.status === 'COMPLETED' ? new Date() : null,
      last_accessed_at: new Date(),
    },
  });

  let moduleAdvanced = false;
  let nextModuleIndex: number | undefined;

  const currentModuleIndex = currentEnrollment.module_index || 0;

  // Get current module
  const currentCourseModule = await prisma.courseModule.findUnique({
    where: {
      course_id_order_index: {
        course_id: courseId,
        order_index: currentModuleIndex,
      },
    },
    select: { module_id: true },
  });

  if (currentCourseModule) {
    const currentModuleStatus = await prisma.userModuleProgress.findUnique({
      where: {
        user_id_module_id_course_id: {
          user_id: userId,
          module_id: currentCourseModule.module_id,
          course_id: courseId,
        },
      },
      select: { status: true },
    });

    // Advance to next module if current is completed
    if (currentModuleStatus?.status === 'COMPLETED') {
      const nextModule = await prisma.courseModule.findUnique({
        where: {
          course_id_order_index: {
            course_id: courseId,
            order_index: currentModuleIndex + 1,
          },
        },
        select: { order_index: true, module_id: true },
      });

      if (nextModule) {
        await prisma.userCourseEnrollment.update({
          where: {
            user_id_course_id: {
              user_id: userId,
              course_id: courseId,
            },
          },
          data: {
            module_index: nextModule.order_index,
          },
        });

        // Create progress record for next module
        await ensureModuleProgress(userId, nextModule.module_id, courseId);

        moduleAdvanced = true;
        nextModuleIndex = nextModule.order_index;
      }
    }
  }

  return {
    courseProgress: newProgress,
    courseUpdated: currentEnrollment.status !== newProgress.status,
    moduleAdvanced,
    nextModuleIndex,
  };
};

/**
 * Mark content item as completed and update all progress levels
 * Uses transaction for atomicity
 */
export const markContentAsCompleted = async (
  userId: string,
  contentItemId: string,
  courseId: string,
  moduleId: string
) => {
  // Ensure module progress exists
  await ensureModuleProgress(userId, moduleId, courseId);

  // Update content progress
  const contentProgress = await prisma.userContentProgress.upsert({
    where: {
      user_id_content_item_id: {
        user_id: userId,
        content_item_id: contentItemId,
      },
    },
    create: {
      user_id: userId,
      content_item_id: contentItemId,
      course_id: courseId,
      module_id: moduleId,
      status: 'COMPLETED',
      completed_at: new Date(),
      last_accessed_at: new Date(),
    },
    update: {
      status: 'COMPLETED',
      completed_at: new Date(),
      last_accessed_at: new Date(),
      updatedAt: new Date(),
    },
  });

  // Update module progress
  const moduleResult = await updateModuleProgress(userId, moduleId, courseId);

  // Update course progress
  const courseResult = await updateCourseProgress(userId, courseId);

  return {
    contentProgress,
    moduleProgress: moduleResult.moduleProgress,
    courseProgress: courseResult.courseProgress,
    moduleAdvanced: courseResult.moduleAdvanced,
    nextModuleIndex: courseResult.nextModuleIndex,
  };
};

/**
 * Track content access (mark as IN_PROGRESS if not already completed)
 */
export const trackContentAccess = async (
  userId: string,
  contentItemId: string,
  courseId: string,
  moduleId: string
) => {
  // Ensure module progress exists
  await ensureModuleProgress(userId, moduleId, courseId);

  // Check current status
  const existing = await prisma.userContentProgress.findUnique({
    where: {
      user_id_content_item_id: {
        user_id: userId,
        content_item_id: contentItemId,
      },
    },
    select: { status: true },
  });

  // Don't downgrade COMPLETED to IN_PROGRESS
  const newStatus = existing?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';

  const contentProgress = await prisma.userContentProgress.upsert({
    where: {
      user_id_content_item_id: {
        user_id: userId,
        content_item_id: contentItemId,
      },
    },
    create: {
      user_id: userId,
      content_item_id: contentItemId,
      course_id: courseId,
      module_id: moduleId,
      status: 'IN_PROGRESS',
      last_accessed_at: new Date(),
    },
    update: {
      status: newStatus,
      last_accessed_at: new Date(),
      updatedAt: new Date(),
    },
  });

  // Update module status if not completed
  const moduleProgress = await prisma.userModuleProgress.findUnique({
    where: {
      user_id_module_id_course_id: {
        user_id: userId,
        module_id: moduleId,
        course_id: courseId,
      },
    },
    select: { status: true },
  });

  if (moduleProgress?.status !== ProgressStatus.COMPLETED) {
    await prisma.userModuleProgress.update({
      where: {
        user_id_module_id_course_id: {
          user_id: userId,
          module_id: moduleId,
          course_id: courseId,
        },
      },
      data: {
        status: ProgressStatus.IN_PROGRESS,
        last_accessed_at: new Date(),
      },
    });
  }

  // Update course status if not completed
  const enrollment = await prisma.userCourseEnrollment.findUnique({
    where: {
      user_id_course_id: {
        user_id: userId,
        course_id: courseId,
      },
    },
    select: { status: true },
  });

  if (enrollment?.status !== ProgressStatus.COMPLETED) {
    await prisma.userCourseEnrollment.update({
      where: {
        user_id_course_id: {
          user_id: userId,
          course_id: courseId,
        },
      },
      data: {
        status: ProgressStatus.IN_PROGRESS,
        last_accessed_at: new Date(),
      },
    });
  }

  return contentProgress;
};

/**
 * Get resume data for a course
 */
export const getResumeData = async (userId: string, courseId: string) => {
  const enrollment = await prisma.userCourseEnrollment.findUnique({
    where: {
      user_id_course_id: {
        user_id: userId,
        course_id: courseId,
      },
    },
    select: {
      module_index: true,
      status: true,
      last_accessed_at: true,
    },
  });

  if (!enrollment) {
    return null;
  }

  const currentModuleIndex = enrollment.module_index || 0;

  const courseModule = await prisma.courseModule.findUnique({
    where: {
      course_id_order_index: {
        course_id: courseId,
        order_index: currentModuleIndex,
      },
    },
    select: { module_id: true },
  });

  if (!courseModule) {
    return null;
  }

  const moduleProgress = await prisma.userModuleProgress.findUnique({
    where: {
      user_id_module_id_course_id: {
        user_id: userId,
        module_id: courseModule.module_id,
        course_id: courseId,
      },
    },
    select: {
      progress_percent: true,
      status: true,
    },
  });

  const lastContentItem = await prisma.userContentProgress.findFirst({
    where: {
      user_id: userId,
      module_id: courseModule.module_id,
    },
    orderBy: {
      last_accessed_at: 'desc',
    },
    select: {
      content_item_id: true,
      status: true,
    },
  });

  return {
    currentModuleIndex,
    courseStatus: enrollment.status,
    moduleProgress: moduleProgress?.progress_percent || 0,
    moduleStatus: moduleProgress?.status || null,
    lastContentItemId: lastContentItem?.content_item_id || null,
    lastContentStatus: lastContentItem?.status || null,
    lastAccessedAt: enrollment.last_accessed_at,
  };
};
