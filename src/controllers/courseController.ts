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

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: 'Invalid course ID format' });
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

        // Transform the response to flatten the module structure
        const transformedCourse = {
            ...course,
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
