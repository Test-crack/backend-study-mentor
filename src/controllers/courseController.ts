import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { DifficultyType, Prisma } from '@prisma/client';

export const getCourses = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const { difficulty, domain, sortBy, sortOrder, search } = req.query;

        // Build filter conditions
        const where: Prisma.CourseWhereInput = {
            is_published: true, // Only show published courses
        };

        if (search) {
            where.OR = [
                { title: { contains: search as string, mode: 'insensitive' } },
                { description: { contains: search as string, mode: 'insensitive' } },
            ];
        }

        if (difficulty) {
            // Validate difficulty enum
            if (Object.values(DifficultyType).includes(difficulty as DifficultyType)) {
                where.difficulty = difficulty as DifficultyType;
            }
        }

        if (domain) {
            // Support filtering by Domain relation name
            // Note: This relies on the Domain entity being linked. 
            // If migrating, we might want to checks the string field 'domain' as fallback, 
            // but for clean design we prioritize the relation.
            where.Domain = {
                name: {
                    contains: domain as string,
                    mode: 'insensitive',
                }
            };
        }

        // Build sorting
        const orderBy: Prisma.CourseOrderByWithRelationInput = {};
        const validSortFields = ['price', 'duration_minutes', 'created_at', 'updated_at'];
        const order = (sortOrder === 'desc' ? 'desc' : 'asc');

        if (sortBy && validSortFields.includes(sortBy as string)) {
            orderBy[sortBy as keyof Prisma.CourseOrderByWithRelationInput] = order;
        } else {
            // Default sorting
            orderBy.created_at = 'desc';
        }

        // Execute query
        const [courses, total] = await Promise.all([
            prisma.course.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    description: true,
                    // Select new Domain relation
                    Domain: {
                        select: {
                            id: true,
                            name: true,
                            slug: true
                        }
                    },
                    difficulty: true,
                    duration_minutes: true,
                    price: true,
                    created_at: true,
                    updated_at: true,
                    _count: {
                        select: {
                            CourseModule: true,
                        }
                    }
                },
            }),
            prisma.course.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        res.json({
            data: courses,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasMore: page < totalPages,
            },
        });
    } catch (error) {
        console.error('[getCourses] Error:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
};

export const getCourseById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId: queryUserId } = req.query;
        const appUserId = (req as any).appUserId;

        // Use appUserId as primary, queryUserId as optional override
        const activeUserId = queryUserId || appUserId;

        // Validate UUID format for course ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: 'Invalid course ID format' });
        }

        // Validate activeUserId if provided
        if (activeUserId && !uuidRegex.test(activeUserId as string)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }

        const course = await prisma.course.findUnique({
            where: { id },
            select: {
                id: true,
                title: true,
                slug: true,
                description: true,
                Domain: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    }
                },
                difficulty: true,
                duration_minutes: true,
                price: true,
                is_published: true,
                created_at: true,
                updated_at: true,
                CourseModule: {
                    select: {
                        id: true,
                        order_index: true,
                        Module: {
                            select: {
                                id: true,
                                title: true,
                                description: true,
                                domain: true,
                                created_at: true,
                                updated_at: true,
                                _count: {
                                    select: {
                                        ModuleConcept: true,
                                    }
                                }
                            }
                        }
                    },
                    orderBy: {
                        order_index: 'asc'
                    }
                },
                _count: {
                    select: {
                        CourseModule: true,
                        UserCourseEnrollment: true,
                    }
                }
            }
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Check enrollment if userId is available
        let isEnrolled = false;
        let enrollmentStatus = null;
        let progressPercent = 0;
        let moduleIndex = 0;

        if (activeUserId) {
            const enrollment = await prisma.userCourseEnrollment.findUnique({
                where: {
                    user_id_course_id: {
                        user_id: activeUserId as string,
                        course_id: id,
                    }
                },
                select: {
                    status: true,
                    progress_percent: true,
                    module_index: true,
                }
            });

            if (enrollment) {
                isEnrolled = true;
                enrollmentStatus = enrollment.status;
                progressPercent = enrollment.progress_percent || 0;
                moduleIndex = enrollment.module_index || 0;
            }
        }

        // Transform the response to flatten the module structure
        const transformedCourse = {
            ...course,
            isEnrolled,
            enrollmentStatus,
            progressPercent,
            moduleIndex,
            modules: course.CourseModule.map(cm => ({
                ...cm.Module,
                order_index: cm.order_index,
                courseModuleId: cm.id,
            })),
            CourseModule: undefined, // Remove the original nested structure
        };

        res.json({ data: transformedCourse });
    } catch (error) {
        console.error('[getCourseById] Error:', error);
        res.status(500).json({ error: 'Failed to fetch course details' });
    }
};

export const enrollUserInCourse = async (req: Request, res: Response) => {
    try {
        const { courseId } = req.body;
        const userId = (req as any).appUserId;

        // Validate required fields
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!courseId) {
            return res.status(400).json({ error: 'courseId is required' });
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(courseId)) {
            return res.status(400).json({ error: 'Invalid courseId format' });
        }
        console.log('userId:', userId);
        console.log('courseId:', courseId);
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if course exists and is published
        const course = await prisma.course.findUnique({
            where: { id: courseId }
        });
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        if (!course.is_published) {
            return res.status(400).json({ error: 'Course is not published' });
        }

        // Check if user is already enrolled
        const existingEnrollment = await prisma.userCourseEnrollment.findUnique({
            where: {
                user_id_course_id: {
                    user_id: userId,
                    course_id: courseId
                }
            }
        });

        if (existingEnrollment) {
            return res.status(409).json({
                error: 'User is already enrolled in this course',
                enrollment: existingEnrollment
            });
        }

        // Create enrollment
        const enrollment = await prisma.userCourseEnrollment.create({
            data: {
                user_id: userId,
                course_id: courseId,
                status: 'NOT_STARTED',
                progress_percent: 0
            },
            include: {
                Course: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        difficulty: true,
                        duration_minutes: true
                    }
                },
                User: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        res.status(201).json({
            message: 'Successfully enrolled in course',
            data: enrollment
        });
    } catch (error) {
        console.error('[enrollUserInCourse] Error:', error);
        res.status(500).json({ error: 'Failed to enroll user in course' });
    }
};

export const getModuleContent = async (req: Request, res: Response) => {
    try {
        const { courseId, orderIndex } = req.params;
        const userId = (req as any).appUserId;

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const idx = orderIndex ? parseInt(orderIndex) : null;
        if (orderIndex && isNaN(idx as number)) {
            return res.status(400).json({ error: 'orderIndex must be a number' });
        }

        // 1. Verify Enrollment
        const enrollment = await prisma.userCourseEnrollment.findUnique({
            where: {
                user_id_course_id: {
                    user_id: userId,
                    course_id: courseId,
                }
            }
        });

        if (!enrollment) {
            return res.status(403).json({ error: 'Access denied. You are not enrolled in this course.' });
        }

        // Use enrollment.module_index if orderIndex is not provided
        const targetIdx = idx !== null ? idx : (enrollment.module_index || 0);

        // 2. Fetch Module, Concepts, and Content
        const courseModule = await prisma.courseModule.findUnique({
            where: {
                course_id_order_index: {
                    course_id: courseId,
                    order_index: targetIdx,
                }
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
                                                MCQ: {
                                                    select: {
                                                        id: true,
                                                        question: true,
                                                        options: true,
                                                        difficulty: true,
                                                        // Explicitly excluding correct_answer and explanation
                                                    }
                                                }
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
            return res.status(404).json({ error: 'Module not found at this index for the specified course' });
        }

        // 3. Transform data into an organized structure
        const result = {
            courseId,
            module: {
                id: courseModule.Module.id,
                title: courseModule.Module.title,
                description: courseModule.Module.description,
                order_index: courseModule.order_index,
                concepts: courseModule.Module.ModuleConcept.map(mc => ({
                    id: mc.Concept.id,
                    learningObjective: mc.Concept.learningObjective, // Using learningObjective or we could use a title if Concept had one
                    slug: mc.Concept.conceptSlug,
                    order_index: mc.order_index,
                    contentItems: mc.Concept.CourseContentItem.map(item => ({
                        id: item.id,
                        type: item.content_kind,
                        title: item.title,
                        is_required: item.is_required,
                        sequence_order: item.sequence_order,
                        content: item.content_kind === 'NOTES' ? item.Note : item.MCQ
                    }))
                }))
            }
        };
        console.log(result.module.concepts);
        res.json({ data: result });
    } catch (error) {
        console.error('[getModuleContent] Error:', error);
        res.status(500).json({ error: 'Failed to fetch module content' });
    }
};
