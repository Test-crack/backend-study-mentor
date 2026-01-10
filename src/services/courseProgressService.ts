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
      AND ump."course_id" = ${courseId}::uuid
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
 * Calculate overall course progress including partial module progress
 * Calculates each module's progress on-the-fly based on content completion
 * Formula: sum of all module progress percentages / total modules
 */
export const calculateOverallCourseProgress = async (
  userId: string,
  courseId: string
): Promise<number> => {
  // Get all modules for this course
  const modules = await prisma.$queryRaw<
    Array<{
      module_id: string;
      order_index: number;
    }>
  >`
    SELECT 
      cm."module_id",
      cm."order_index"
    FROM "CourseModule" cm
    WHERE cm."course_id" = ${courseId}::uuid
    ORDER BY cm."order_index" ASC
  `;

  if (modules.length === 0) return 0;

  // Calculate progress for each module on-the-fly
  let totalProgress = 0;
  
  for (const module of modules) {
    const moduleProgress = await calculateModuleProgress(userId, module.module_id, courseId);
    totalProgress += moduleProgress.progress_percent;
  }

  // Overall progress = average of all module progress
  return Math.round(totalProgress / modules.length);
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

  // Determine the correct status:
  // - COMPLETED if all modules are done
  // - IN_PROGRESS if any module has progress (even if no modules are fully completed)
  // - NOT_STARTED only if no progress at all
  let enrollmentStatus = newProgress.status;
  
  // If calculateCourseProgress says NOT_STARTED, check if any module is IN_PROGRESS
  if (newProgress.status === 'NOT_STARTED') {
    const anyModuleInProgress = await prisma.userModuleProgress.findFirst({
      where: {
        user_id: userId,
        course_id: courseId,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
    });
    
    if (anyModuleInProgress) {
      enrollmentStatus = ProgressStatus.IN_PROGRESS;
    }
  }

  await prisma.userCourseEnrollment.update({
    where: {
      user_id_course_id: {
        user_id: userId,
        course_id: courseId,
      },
    },
    data: {
      status: enrollmentStatus,
      completed_at: enrollmentStatus === 'COMPLETED' ? new Date() : null,
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
    courseProgress: {
      ...newProgress,
      status: enrollmentStatus,
    },
    courseUpdated: currentEnrollment.status !== enrollmentStatus,
    moduleAdvanced,
    nextModuleIndex,
  };
};

/**
 * Mark content item as completed and update all progress levels
 * Updates: UserContentProgress (status, completed_at, updatedAt)
 *          UserModuleProgress (status, completed_at if finished)
 *          UserCourseEnrollment (module_index after completing a module)
 */
export const markContentAsCompleted = async (
  userId: string,
  contentItemId: string,
  courseId: string,
  moduleId: string
) => {
  // Ensure module progress exists
  await ensureModuleProgress(userId, moduleId, courseId);

  // Update UserContentProgress - status, completed_at, updatedAt
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

  // Update UserModuleProgress - status, progress_percent, completed_at (if finished)
  const moduleResult = await updateModuleProgress(userId, moduleId, courseId);

  // Update UserCourseEnrollment - module_index (after completing a module)
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
 * Updates: UserContentProgress (status, last_accessed_at)
 *          UserModuleProgress (status, last_accessed_at)
 *          UserCourseEnrollment (module_index if accessing higher module)
 */
export const trackContentAccess = async (
  userId: string,
  contentItemId: string,
  courseId: string,
  moduleId: string
) => {
  // Ensure module progress exists
  await ensureModuleProgress(userId, moduleId, courseId);

  // Check current content status
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

  // Update UserContentProgress - status, last_accessed_at
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

  // Update UserModuleProgress - status (if not completed), last_accessed_at
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

  // Get current enrollment and the order_index of accessed module
  const [enrollment, accessedModule] = await Promise.all([
    prisma.userCourseEnrollment.findUnique({
      where: {
        user_id_course_id: {
          user_id: userId,
          course_id: courseId,
        },
      },
      select: { status: true, module_index: true },
    }),
    prisma.courseModule.findFirst({
      where: {
        course_id: courseId,
        module_id: moduleId,
      },
      select: { order_index: true },
    }),
  ]);

  if (enrollment && accessedModule) {
    const currentModuleIndex = enrollment.module_index || 0;
    const accessedModuleIndex = accessedModule.order_index;

    // Update module_index if accessing a higher module
    const shouldUpdateModuleIndex = accessedModuleIndex > currentModuleIndex;

    if (enrollment.status !== ProgressStatus.COMPLETED || shouldUpdateModuleIndex) {
      await prisma.userCourseEnrollment.update({
        where: {
          user_id_course_id: {
            user_id: userId,
            course_id: courseId,
          },
        },
        data: {
          status: enrollment.status !== ProgressStatus.COMPLETED ? ProgressStatus.IN_PROGRESS : enrollment.status,
          last_accessed_at: new Date(),
          ...(shouldUpdateModuleIndex && { module_index: accessedModuleIndex }),
        },
      });
    }
  }

  return contentProgress;
};

/**
 * Get resume data for a course
 * Updates course status to IN_PROGRESS if NOT_STARTED
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

  // Update course status to IN_PROGRESS if NOT_STARTED
  if (enrollment.status === ProgressStatus.NOT_STARTED) {
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
    enrollment.status = ProgressStatus.IN_PROGRESS;
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

  const moduleProgressRecord = await prisma.userModuleProgress.findUnique({
    where: {
      user_id_module_id_course_id: {
        user_id: userId,
        module_id: courseModule.module_id,
        course_id: courseId,
      },
    },
    select: {
      status: true,
    },
  });

  // Calculate module progress on-the-fly
  const calculatedModuleProgress = await calculateModuleProgress(
    userId,
    courseModule.module_id,
    courseId
  );

  // Get the furthest content item user has reached (highest sequence_order)
  // Also get the last accessed one for reference
  const contentProgress = await prisma.$queryRaw<
    Array<{
      furthest_content_id: string | null;
      furthest_sequence: number | null;
      furthest_status: string | null;
      last_accessed_content_id: string | null;
      last_accessed_status: string | null;
    }>
  >`
    WITH user_content AS (
      SELECT 
        ucp.content_item_id,
        ucp.status,
        ucp.last_accessed_at,
        cci.sequence_order,
        mc.order_index as concept_order
      FROM "UserContentProgress" ucp
      JOIN "CourseContentItem" cci ON ucp.content_item_id = cci.id
      JOIN "ModuleConcept" mc ON cci.concept_id = mc.concept_id AND mc.module_id = ${courseModule.module_id}::uuid
      WHERE ucp.user_id = ${userId}::uuid
        AND ucp.module_id = ${courseModule.module_id}::uuid
    ),
    furthest AS (
      SELECT content_item_id, status
      FROM user_content
      ORDER BY concept_order DESC, sequence_order DESC
      LIMIT 1
    ),
    last_accessed AS (
      SELECT content_item_id, status
      FROM user_content
      ORDER BY last_accessed_at DESC
      LIMIT 1
    )
    SELECT 
      f.content_item_id as furthest_content_id,
      f.status as furthest_status,
      la.content_item_id as last_accessed_content_id,
      la.status as last_accessed_status
    FROM (SELECT 1) dummy
    LEFT JOIN furthest f ON true
    LEFT JOIN last_accessed la ON true
  `;

  const progress = contentProgress[0];

  return {
    currentModuleIndex,
    courseStatus: enrollment.status,
    moduleProgress: calculatedModuleProgress.progress_percent,
    moduleStatus: moduleProgressRecord?.status || calculatedModuleProgress.status,
    // Furthest point in the course (by sequence)
    furthestContentItemId: progress?.furthest_content_id || null,
    furthestContentStatus: progress?.furthest_status || null,
    // Last accessed (for "continue where you left off")
    lastAccessedContentItemId: progress?.last_accessed_content_id || null,
    lastAccessedContentStatus: progress?.last_accessed_status || null,
    lastAccessedAt: enrollment.last_accessed_at,
  };
};

/**
 * Mark course as completed
 * Updates: UserCourseEnrollment (status, completed_at)
 */
export const markCourseAsCompleted = async (userId: string, courseId: string) => {
  // Verify all modules are completed
  const courseProgress = await calculateCourseProgress(userId, courseId);

  if (courseProgress.status !== 'COMPLETED') {
    return {
      success: false,
      message: 'Cannot complete course - not all modules are finished',
      courseProgress,
    };
  }

  // Update UserCourseEnrollment - status, completed_at
  const enrollment = await prisma.userCourseEnrollment.update({
    where: {
      user_id_course_id: {
        user_id: userId,
        course_id: courseId,
      },
    },
    data: {
      status: ProgressStatus.COMPLETED,
      completed_at: new Date(),
    },
  });

  return {
    success: true,
    message: 'Course completed successfully',
    enrollment,
    courseProgress,
  };
};
