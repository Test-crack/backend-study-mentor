import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// GET /api/profile - Fetch user profile
export const getUserProfile = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    // Get userId from authenticated request
    const userId = req.appUserId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        countryCode: true,
        phoneNo: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        Instructor: {
          select: {
            id: true,
            bio: true,
            specialization: true,
            rating: true,
            socialLinks: true,
          }
        }
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter out Instructor object if the user is not an instructor
    if (user.role !== 'INSTRUCTOR') {
      delete (user as any).Instructor;
    }

    res.json({ user });
  } catch (error) {
    console.error('[getUserProfile] Error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// PUT /api/profile - Update user profile
export const updateUserProfile = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    // Get userId from authenticated request
    const userId = req.appUserId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { name, countryCode, phoneNo } = req.body;

    // Build update data object with only provided fields
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (countryCode !== undefined) updateData.countryCode = countryCode;
    if (phoneNo !== undefined) updateData.phoneNo = phoneNo;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        countryCode: true,
        phoneNo: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ user: updatedUser, message: 'Profile updated successfully' });
  } catch (error: any) {
    console.error('[updateUserProfile] Error:', error);

    // Handle unique constraint violation for email
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email already exists' });
    }

    res.status(500).json({ error: 'Failed to update user profile' });
  }
};
