import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

/**
 * DPDP: a student is a minor if under 18 today. Computed on write (age depends on
 * "today", so it can't be a Postgres generated column). Returns false for a null DOB.
 */
function computeIsMinor(dob: Date): boolean {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age < 18;
}

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
        profileImage: true,
        createdAt: true,
        updatedAt: true,
        institute_owners: {
          select: {
            institutes: {
              select: {
                is_active: true
              }
            }
          }
        },
        institute_admins: {
          select: {
            institutes: {
              select: {
                is_active: true
              }
            }
          }
        },
        institute_students: {
          select: {
            isDiagnosed: true,
            recommendationSeeded: true,
            target_band: true,
            date_of_birth: true,
            is_minor: true
          }
        },
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

    // Determine instituteIsActive for owners/admins
    let instituteIsActive = true; // Default true for Roles without institutes (Student/Superadmin)
    if (user.role === 'INSTITUTE_OWNER' && user.institute_owners?.institutes) {
      instituteIsActive = user.institute_owners.institutes.is_active;
    } else if (user.role === 'INSTITUTE_ADMIN' && user.institute_admins?.institutes) {
      instituteIsActive = user.institute_admins.institutes.is_active;
    }

    const isEnrolled = user.role === 'STUDENT' ? !!user.institute_students : true;

    let isDiagnosed = false;
    let recommendationSeeded = false;
    let targetBand = null;
    let dateOfBirth: Date | null = null;
    let isMinor = false;
    if (user.role === 'STUDENT' && user.institute_students) {
      isDiagnosed = user.institute_students.isDiagnosed;
      recommendationSeeded = user.institute_students.recommendationSeeded;
      targetBand = user.institute_students.target_band;
      dateOfBirth = user.institute_students.date_of_birth;
      isMinor = user.institute_students.is_minor;
    }

    delete (user as any).institute_owners;
    delete (user as any).institute_admins;
    delete (user as any).institute_students;

    // Note: exam_date is served by GET /api/student/competency-scores (the profile
    // page's source).
    res.json({ user: { ...user, instituteIsActive, isDiagnosed, recommendationSeeded, targetBand, dateOfBirth, isMinor, isEnrolled } });
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

    // Accept camelCase (primary) and snake_case (fallback) for the student-goal fields.
    const { name, countryCode, phoneNo } = req.body;
    const targetBand  = req.body.targetBand  ?? req.body.target_band;
    const examDate    = req.body.examDate    ?? req.body.exam_date;
    const dateOfBirth = req.body.dateOfBirth ?? req.body.date_of_birth;

    // â”€â”€ User fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined)        updateData.name = name;
    if (countryCode !== undefined) updateData.countryCode = countryCode;
    if (phoneNo !== undefined)     updateData.phoneNo = phoneNo;

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
        profileImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // â”€â”€ Student goal fields (target_band, exam_date) â€” validated â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const studentData: any = {};

    if (targetBand !== undefined && targetBand !== null) {
      const band = Number(targetBand);
      if (!Number.isFinite(band) || band < 4.0 || band > 9.0) {
        return res.status(400).json({ error: 'Target band must be between 4.0 and 9.0.' });
      }
      // Snap to the nearest 0.5 so only valid IELTS bands are stored.
      studentData.target_band = Math.round(band * 2) / 2;
    }

    if (examDate !== undefined && examDate !== null) {
      const d = new Date(examDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid exam date.' });
      }
      // Must be in the future (compare on calendar day, not time-of-day).
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const cmp = new Date(d);   cmp.setHours(0, 0, 0, 0);
      if (cmp <= today) {
        return res.status(400).json({ error: 'Exam date must be in the future.' });
      }
      studentData.exam_date = d;
    }

    // Date of birth — must be a valid past date. is_minor is derived, never trusted from the client.
    if (dateOfBirth !== undefined) {
      if (dateOfBirth === null || dateOfBirth === '') {
        studentData.date_of_birth = null;
        studentData.is_minor = false;
      } else {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
          return res.status(400).json({ error: 'Invalid date of birth.' });
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const cmp = new Date(dob); cmp.setHours(0, 0, 0, 0);
        if (cmp >= today) {
          return res.status(400).json({ error: 'Date of birth must be in the past.' });
        }
        studentData.date_of_birth = dob;
        studentData.is_minor = computeIsMinor(dob);
      }
    }

    if (Object.keys(studentData).length > 0) {
      const result = await prisma.instituteStudent.updateMany({
        where: { user_id: userId },
        data:  studentData,
      });
      if (result.count === 0) {
        // Only students have these fields; a non-student (or unenrolled) hitting them is a 400.
        return res.status(400).json({ error: 'Goal fields can only be set on an enrolled student profile.' });
      }
    }

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

// PUT /api/profile/image - Upload profile image
import { uploadImage, deleteImage, getPublicIdFromUrl } from '../services/cloudinaryService';

export const uploadProfileImage = async (req: AuthRequest & { appUserId?: string; file?: Express.Multer.File }, res: Response) => {
  try {
    const userId = req.appUserId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // 1. Get current user to check for existing image
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileImage: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Upload new image to Cloudinary
    console.log(`[ProfileUpload] Uploading file for user ${userId}...`);
    const { url } = await uploadImage(req.file.path);
    console.log(`[ProfileUpload] Upload success: ${url}`);

    // 3. Update User record
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        profileImage: url,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        profileImage: true,
        updatedAt: true,
      },
    });

    // 4. Cleanup old image (async, non-blocking)
    if (currentUser.profileImage) {
      const publicId = getPublicIdFromUrl(currentUser.profileImage);
      if (publicId) {
        console.log(`[ProfileUpload] Deleting old image: ${publicId}`);
        deleteImage(publicId).catch(err =>
          console.error('[ProfileUpload] Failed to delete old image:', err)
        );
      }
    }

    res.json({
      message: 'Profile image updated successfully',
      user: updatedUser
    });

  } catch (error: any) {
    console.error('[uploadProfileImage] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload profile image' });
  }
};

// DELETE /api/profile/image - Remove profile image
export const removeProfileImage = async (req: AuthRequest & { appUserId?: string }, res: Response) => {
  try {
    const userId = req.appUserId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 1. Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileImage: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!currentUser.profileImage) {
      return res.status(400).json({ error: 'No profile image to remove' });
    }

    // 2. Delete from Cloudinary
    const publicId = getPublicIdFromUrl(currentUser.profileImage);
    if (publicId) {
      console.log(`[ProfileRemove] Deleting image: ${publicId}`);
      await deleteImage(publicId);
    } else {
      console.warn(`[ProfileRemove] Could not extract publicId from URL: ${currentUser.profileImage}`);
    }

    // 3. Update User record (set to null)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        profileImage: null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        profileImage: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'Profile image removed successfully',
      user: updatedUser
    });

  } catch (error: any) {
    console.error('[removeProfileImage] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to remove profile image' });
  }
};
