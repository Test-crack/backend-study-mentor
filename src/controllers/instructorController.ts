import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { slugify } from '../helper/stringUtils';

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
                        select: { CourseModule: true }
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
        const { title, description, domainId, difficulty, price } = req.body;

        if (!title || !domainId) {
            return res.status(400).json({ message: 'Title and domainId are required' });
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

            const slug = `${slugify(title)}-${Math.random().toString(36).substring(2, 7)}`;

            return await tx.course.create({
                data: {
                    title,
                    description,
                    domainId,
                    difficulty,
                    price,
                    slug,
                    instructorId: instructor.id,
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
