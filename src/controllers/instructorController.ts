// src/controllers/instructorController.ts
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function getInstructorCourses(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;

        const instructor = await prisma.instructor.findUnique({
            where: { userId: appUserId },
            include: {
                Courses: true,
            },
        });

        if (!instructor) {
            return res.status(404).json({ message: 'Instructor profile not found' });
        }

        res.json(instructor.Courses);
    } catch (error) {
        console.error('getInstructorCourses error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function createInstructorCourse(req: AuthRequest, res: Response) {
    try {
        const appUserId = (req as any).appUserId;
        const { title, description, domainId, difficulty, price } = req.body;

        let instructor = await prisma.instructor.findUnique({
            where: { userId: appUserId },
        });

        // Automatically create instructor profile if it doesn't exist
        if (!instructor) {
            instructor = await prisma.instructor.create({
                data: {
                    userId: appUserId,
                },
            });
        }

        const course = await prisma.course.create({
            data: {
                title,
                description,
                domainId,
                difficulty,
                price,
                instructorId: instructor.id,
            },
        });

        res.status(201).json(course);
    } catch (error) {
        console.error('createInstructorCourse error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
