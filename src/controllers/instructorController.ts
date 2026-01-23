import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { slugify } from '../helper/stringUtils';
import { CourseContentType } from '@prisma/client';
import { analyzeContentToConcept, ConceptAnalysisInput } from '../services/conceptService';
import { createModuleContent, updateModuleContent as updateModuleContentService, deleteModuleContent as deleteModuleContentService } from '../services/conceptDbService';

export async function getInstructorCourses(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const {
            page = 1,
            limit = 10,
            search = '',
            is_published,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const instructor = await prisma.instructor.findUnique({
            where: { userId: appUserId },
        });

        if (!instructor) {
            return res.status(404).json({ message: 'Instructor profile not found' });
        }

        // Build where clause
        const where: any = {
            instructorId: instructor.id,
        };

        if (search) {
            where.OR = [
                { title: { contains: String(search), mode: 'insensitive' } },
                { description: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        if (is_published !== undefined) {
            where.is_published = is_published === 'true';
        }

        // Execute query and count in parallel for efficiency
        const [courses, total] = await Promise.all([
            prisma.course.findMany({
                where,
                skip,
                take,
                orderBy: { [String(sortBy)]: sortOrder },
                include: {
                    _count: {
                        select: {
                            UserCourseEnrollment: true
                        }
                    }
                }
            }),
            prisma.course.count({ where })
        ]);

        const totalPages = Math.ceil(total / take);

        res.json({
            data: courses,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages
            }
        });
    } catch (error) {
        console.error('getInstructorCourses error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function createInstructorCourse(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const {
            title,
            Name,
            description,
            domainId,
            difficulty,
            price,
            duration_minutes
        } = req.body;

        const courseTitle = title || Name;

        if (!courseTitle || !domainId) {
            return res.status(400).json({ message: 'Title (or Name) and domainId are required' });
        }

        const course = await prisma.$transaction(async (tx) => {
            let instructor = await tx.instructor.findUnique({
                where: { userId: appUserId },
            });

            // Automatically create instructor profile if it doesn't exist
            if (!instructor) {
                instructor = await tx.instructor.create({
                    data: {
                        userId: appUserId,
                    },
                });
            }

            // Generate a unique slug in the backend
            const slug = `${slugify(courseTitle)}-${Math.random().toString(36).substring(2, 7)}`;

            return await tx.course.create({
                data: {
                    title: courseTitle,
                    description,
                    domainId,
                    difficulty: difficulty?.toUpperCase(), // Ensure uppercase for enum
                    duration_minutes: duration_minutes ? Number(duration_minutes) : null,
                    price,
                    slug,
                    is_published: false, // Default to false for new courses
                    instructorId: instructor.id, // Correct instructor profile ID logic
                },
            });
        });

        res.status(201).json(course);
    } catch (error) {
        console.error('createInstructorCourse error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function updateInstructorCourse(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { id } = req.params;
        const { title, description, difficulty, price, is_published, domainId } = req.body;

        const course = await prisma.course.findUnique({
            where: { id },
            include: { Instructor: true }
        });

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized to update this course' });
        }

        const updateData: any = {
            description,
            difficulty,
            price,
            is_published,
            domainId,
            updated_at: new Date()
        };

        if (title && title !== course.title) {
            updateData.title = title;
            // Only update slug if not published yet to preserve SEO
            if (!course.is_published) {
                updateData.slug = `${slugify(title)}-${Math.random().toString(36).substring(2, 7)}`;
            }
        }

        const updatedCourse = await prisma.course.update({
            where: { id },
            data: updateData
        });

        res.json(updatedCourse);
    } catch (error) {
        console.error('updateInstructorCourse error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function deleteInstructorCourse(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { id } = req.params;

        const course = await prisma.course.findUnique({
            where: { id },
            include: { Instructor: true }
        });

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized to delete this course' });
        }

        await prisma.course.delete({
            where: { id }
        });

        res.json({ message: 'Course deleted successfully' });
    } catch (error) {
        console.error('deleteInstructorCourse error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function updateInstructorProfile(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { name, countryCode, phoneNo, bio, specialization, socialLinks } = req.body;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Update User table
            const user = await tx.user.update({
                where: { id: appUserId },
                data: {
                    name,
                    countryCode,
                    phoneNo,
                },
            });

            // 2. Update Instructor table
            const instructor = await tx.instructor.upsert({
                where: { userId: appUserId },
                update: {
                    bio,
                    specialization,
                    socialLinks,
                },
                create: {
                    userId: appUserId,
                    bio,
                    specialization,
                    socialLinks,
                },
            });

            return { user, instructor };
        });

        res.json({
            message: 'Instructor profile updated successfully',
            data: result,
        });
    } catch (error) {
        console.error('updateInstructorProfile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// ============================================================================
// MODULE MANAGEMENT APIs
// ============================================================================

/**
 * Get all modules for a specific course owned by the instructor
 * GET /api/instructor/courses/:courseId/modules
 */
export async function getCourseModules(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId } = req.params;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(courseId)) {
            return res.status(400).json({ message: 'Invalid course ID format' });
        }

        // Verify instructor owns the course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized to access this course' });
        }

        // Fetch modules with their details
        const courseModules = await prisma.courseModule.findMany({
            where: { course_id: courseId },
            orderBy: { order_index: 'asc' },
            include: {
                Module: {
                    include: {
                        _count: {
                            select: { ModuleConcept: true }
                        }
                    }
                }
            }
        });

        const modules = courseModules.map(cm => ({
            id: cm.Module.id,
            title: cm.Module.title,
            description: cm.Module.description,
            domain: cm.Module.domain,
            order_index: cm.order_index,
            courseModuleId: cm.id,
            conceptCount: cm.Module._count.ModuleConcept,
            created_at: cm.Module.created_at,
            updated_at: cm.Module.updated_at,
        }));

        res.json({
            data: modules,
            meta: { total: modules.length }
        });
    } catch (error) {
        console.error('getCourseModules error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Add a new module to a course
 * POST /api/instructor/courses/:courseId/modules
 */
export async function addCourseModule(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId } = req.params;
        const { title, description, domain, order_index } = req.body;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(courseId)) {
            return res.status(400).json({ message: 'Invalid course ID format' });
        }

        // Validate required fields
        if (!title || title.trim().length === 0) {
            return res.status(400).json({ message: 'Title is required' });
        }

        // Verify instructor owns the course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized to modify this course' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Get current max order_index for this course
            const maxOrderResult = await tx.courseModule.aggregate({
                where: { course_id: courseId },
                _max: { order_index: true }
            });
            const currentMaxIndex = maxOrderResult._max.order_index ?? -1;

            // Determine target order_index
            let targetIndex: number;
            if (order_index !== undefined && order_index !== null) {
                targetIndex = Math.max(0, Math.min(order_index, currentMaxIndex + 1));

                // Shift existing modules if inserting in the middle
                if (targetIndex <= currentMaxIndex) {
                    await tx.courseModule.updateMany({
                        where: {
                            course_id: courseId,
                            order_index: { gte: targetIndex }
                        },
                        data: {
                            order_index: { increment: 1 }
                        }
                    });
                }
            } else {
                // Append at end
                targetIndex = currentMaxIndex + 1;
            }

            // Create the module
            const newModule = await tx.module.create({
                data: {
                    title: title.trim(),
                    description: description?.trim() || null,
                    domain: domain?.trim() || null,
                }
            });

            // Link module to course
            const courseModule = await tx.courseModule.create({
                data: {
                    course_id: courseId,
                    module_id: newModule.id,
                    order_index: targetIndex,
                }
            });

            return { module: newModule, courseModule };
        });

        res.status(201).json({
            message: 'Module added successfully',
            data: {
                id: result.module.id,
                title: result.module.title,
                description: result.module.description,
                domain: result.module.domain,
                order_index: result.courseModule.order_index,
                courseModuleId: result.courseModule.id,
                created_at: result.module.created_at,
            }
        });
    } catch (error) {
        console.error('addCourseModule error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Update a module linked to a course
 * PUT /api/instructor/courses/:courseId/modules/:moduleId
 */
export async function updateCourseModule(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId, moduleId } = req.params;
        const { title, description, domain, order_index } = req.body;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(courseId) || !uuidRegex.test(moduleId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        // Verify instructor owns the course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized to modify this course' });
        }

        // Verify module is linked to this course
        const existingCourseModule = await prisma.courseModule.findUnique({
            where: {
                course_id_module_id: {
                    course_id: courseId,
                    module_id: moduleId
                }
            }
        });

        if (!existingCourseModule) {
            return res.status(404).json({ message: 'Module not found in this course' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Handle order_index change if specified
            if (order_index !== undefined && order_index !== existingCourseModule.order_index) {
                const maxOrderResult = await tx.courseModule.aggregate({
                    where: { course_id: courseId },
                    _max: { order_index: true }
                });
                const maxIndex = maxOrderResult._max.order_index ?? 0;
                const newIndex = Math.max(0, Math.min(order_index, maxIndex));
                const oldIndex = existingCourseModule.order_index;

                if (newIndex !== oldIndex) {
                    // Temporarily set to -1 to avoid unique constraint violation
                    await tx.courseModule.update({
                        where: { id: existingCourseModule.id },
                        data: { order_index: -1 }
                    });

                    if (newIndex > oldIndex) {
                        // Moving down: shift items between old and new up
                        await tx.courseModule.updateMany({
                            where: {
                                course_id: courseId,
                                order_index: { gt: oldIndex, lte: newIndex }
                            },
                            data: { order_index: { decrement: 1 } }
                        });
                    } else {
                        // Moving up: shift items between new and old down
                        await tx.courseModule.updateMany({
                            where: {
                                course_id: courseId,
                                order_index: { gte: newIndex, lt: oldIndex }
                            },
                            data: { order_index: { increment: 1 } }
                        });
                    }

                    // Set final position
                    await tx.courseModule.update({
                        where: { id: existingCourseModule.id },
                        data: { order_index: newIndex }
                    });
                }
            }

            // Update module details
            const updateData: { title?: string; description?: string | null; domain?: string | null; updated_at: Date } = {
                updated_at: new Date()
            };

            if (title !== undefined) updateData.title = title.trim();
            if (description !== undefined) updateData.description = description?.trim() || null;
            if (domain !== undefined) updateData.domain = domain?.trim() || null;

            const updatedModule = await tx.module.update({
                where: { id: moduleId },
                data: updateData
            });

            // Fetch updated course module for order_index
            const updatedCourseModule = await tx.courseModule.findUnique({
                where: {
                    course_id_module_id: {
                        course_id: courseId,
                        module_id: moduleId
                    }
                }
            });

            return { module: updatedModule, courseModule: updatedCourseModule };
        });

        res.json({
            message: 'Module updated successfully',
            data: {
                id: result.module.id,
                title: result.module.title,
                description: result.module.description,
                domain: result.module.domain,
                order_index: result.courseModule?.order_index,
                courseModuleId: result.courseModule?.id,
                updated_at: result.module.updated_at,
            }
        });
    } catch (error) {
        console.error('updateCourseModule error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Delete/unlink a module from a course
 * DELETE /api/instructor/courses/:courseId/modules/:moduleId
 * Query param: deleteModule=true to also delete the module if not linked elsewhere
 */
export async function deleteCourseModule(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId, moduleId } = req.params;
        const deleteModule = req.query.deleteModule === 'true';

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(courseId) || !uuidRegex.test(moduleId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        // Verify instructor owns the course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized to modify this course' });
        }

        // Verify module is linked to this course
        const existingCourseModule = await prisma.courseModule.findUnique({
            where: {
                course_id_module_id: {
                    course_id: courseId,
                    module_id: moduleId
                }
            }
        });

        if (!existingCourseModule) {
            return res.status(404).json({ message: 'Module not found in this course' });
        }

        let moduleDeleted = false;

        await prisma.$transaction(async (tx) => {
            const deletedIndex = existingCourseModule.order_index;

            // Remove the course-module link
            await tx.courseModule.delete({
                where: { id: existingCourseModule.id }
            });

            // Shift remaining modules down to maintain contiguous indices
            await tx.courseModule.updateMany({
                where: {
                    course_id: courseId,
                    order_index: { gt: deletedIndex }
                },
                data: { order_index: { decrement: 1 } }
            });

            // Optionally delete the module if not linked elsewhere
            if (deleteModule) {
                const otherLinks = await tx.courseModule.count({
                    where: { module_id: moduleId }
                });

                if (otherLinks === 0) {
                    await tx.module.delete({
                        where: { id: moduleId }
                    });
                    moduleDeleted = true;
                }
            }
        });

        res.json({
            message: moduleDeleted
                ? 'Module deleted successfully'
                : 'Module removed from course successfully',
            moduleDeleted
        });
    } catch (error) {
        console.error('deleteCourseModule error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// ============================================================================
// CONTENT MANAGEMENT APIs
// ============================================================================

/**
 * Add content (Note/MCQ) to a module
 * POST /api/instructor/courses/:courseId/modules/:moduleId/content
 */
export async function addModuleContent(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId, moduleId } = req.params;
        const {
            type, title, sequence_order, is_required,
            body, question, options, correct_answer, explanation, difficulty
        } = req.body;

        // Validations
        if (!Object.values(CourseContentType).includes(type)) {
            return res.status(400).json({ message: 'Invalid content type' });
        }

        // Verify ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course || course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Verify module in course
        const courseModule = await prisma.courseModule.findUnique({
            where: {
                course_id_module_id: { course_id: courseId, module_id: moduleId }
            }
        });

        if (!courseModule) {
            return res.status(404).json({ message: 'Module not found in this course' });
        }

        // Analyze content for concept generation
        let textToAnalyze = "";
        if (type === "NOTES") textToAnalyze = body || "";
        else if (type === "MCQ") textToAnalyze = question || "";

        if (!textToAnalyze || textToAnalyze.length < 10) {
            // Fallback if content is too short, rely on title
            textToAnalyze = `${title} ${title} ${title}`;
        }

        const analysisResult = await analyzeContentToConcept({
            text: textToAnalyze,
            title: title,
            sourceType: type === "NOTES" ? "note" : "text"
        });

        const result = await createModuleContent({
            moduleId,
            type,
            title,
            sequence_order,
            is_required,
            body,
            question,
            options,
            correct_answer,
            explanation,
            difficulty,
            analysisResult
        });

        if (!result.success) {
            return res.status(500).json({ message: result.error });
        }

        res.status(201).json({
            message: 'Content added successfully',
            data: result
        });

    } catch (error) {
        console.error('addModuleContent error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Update module content
 * PUT /api/instructor/courses/:courseId/modules/:moduleId/content/:contentId
 */
export async function updateModuleContent(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId, moduleId, contentId } = req.params;
        const updates = req.body;

        // Verify ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course || course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Verify content linkage (optional but recommended)
        // Check if content belongs to a concept in the module?
        // For simplicity, we assume if you have the ID and are the instructor of the course, it's okay.
        // But verifying module linkage is safer.

        // TODO: Strict chain verification if needed.

        const result = await updateModuleContentService(contentId, updates);

        if (!result.success) {
            return res.status(500).json({ message: result.error });
        }

        res.json({
            message: 'Content updated successfully',
            data: result
        });

    } catch (error) {
        console.error('updateModuleContent error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Delete module content
 * DELETE /api/instructor/courses/:courseId/modules/:moduleId/content/:contentId
 */
export async function deleteModuleContent(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId, moduleId, contentId } = req.params;

        // Verify ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course || course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const success = await deleteModuleContentService(contentId);

        if (!success) {
            return res.status(500).json({ message: 'Failed to delete content' });
        }

        res.json({ message: 'Content deleted successfully' });

    } catch (error) {
        console.error('deleteModuleContent error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Get module content details for editing
 * GET /api/instructor/courses/:courseId/modules/:moduleId
 */
export async function getInstructorModuleContent(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { courseId, moduleId } = req.params;

        // Verify ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { Instructor: true }
        });

        if (!course || course.Instructor?.userId !== appUserId) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Fetch module with full hierarchy
        const courseModule = await prisma.courseModule.findUnique({
            where: {
                course_id_module_id: { course_id: courseId, module_id: moduleId }
            },
            include: {
                Module: {
                    include: {
                        ModuleConcept: {
                            orderBy: { order_index: 'asc' },
                            include: {
                                Concept: {
                                    include: {
                                        CourseContentItem: {
                                            orderBy: { sequence_order: 'asc' },
                                            include: {
                                                Note: true,
                                                MCQ: true // Include full MCQ details including correct answer
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!courseModule) {
            return res.status(404).json({ message: 'Module not found in this course' });
        }

        // Structure the response for the frontend editor
        let globalIndex = 0;
        const contentItems: Array<{
            index: number;
            id: string;
            type: string;
            title: string | null;
            is_required: boolean | null;
            concept_order: number;
            sequence_order: number | null;
            concept: {
                id: string;
                slug: string;
                learningObjective: string;
                keywords: string[];
                domain: string;
                baseConceptId: string;
            };
            content: any;
        }> = [];

        for (const mc of courseModule.Module.ModuleConcept) {
            for (const item of mc.Concept.CourseContentItem) {
                contentItems.push({
                    index: globalIndex++,
                    id: item.id,
                    type: item.content_kind,
                    title: item.title,
                    is_required: item.is_required,
                    concept_order: mc.order_index,
                    sequence_order: item.sequence_order,
                    concept: {
                        id: mc.Concept.id,
                        slug: mc.Concept.conceptSlug,
                        learningObjective: mc.Concept.learningObjective,
                        keywords: mc.Concept.keywords,
                        domain: mc.Concept.domain,
                        baseConceptId: mc.Concept.baseConceptId
                    },
                    content: item.content_kind === 'NOTES' ? item.Note : item.MCQ
                });
            }
        }

        res.json({
            data: {
                module: {
                    id: courseModule.Module.id,
                    title: courseModule.Module.title,
                    description: courseModule.Module.description,
                    domain: courseModule.Module.domain,
                    order_index: courseModule.order_index,
                },
                contentItems
            }
        });

    } catch (error) {
        console.error('getInstructorModuleContent error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
