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
