// src/middleware/ensureUser.ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from './auth';

export async function ensureUser(
  req: AuthRequest & { appUserId?: number },
  res: Response,
  next: NextFunction
) {
  try {
    const supabaseUserId = req.supabaseUserId;
    const email = req.userEmail;
    const metadata = req.userMetadata || {};

    // Extract useful metadata (Google often provides these)
    const fullName = metadata.full_name || metadata.name;
    const avatarUrl = metadata.avatar_url || metadata.picture;

    if (!supabaseUserId) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    // 1. Try to find by Supabase ID
    let user = await prisma.user.findUnique({
      where: { supabaseuserid: supabaseUserId },
    });

    if (user) {
      // User exists by ID. Check if we should backfill missing info.
      if ((!user.name && fullName) || (!user.profileImage && avatarUrl)) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: user.name || fullName,
            profileImage: user.profileImage || avatarUrl,
          },
        });
      }
    } else {
      // 2. User not found by Supabase ID. Try to find by Email (Account Linking)
      if (email) {
        const existingUserByEmail = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUserByEmail) {
          console.log(`[ensureUser] Linking existing user ${existingUserByEmail.id} (email: ${email}) to new Supabase ID: ${supabaseUserId}`);

          user = await prisma.user.update({
            where: { id: existingUserByEmail.id },
            data: {
              supabaseuserid: supabaseUserId, // Update to the new ID
              name: existingUserByEmail.name || fullName,
              profileImage: existingUserByEmail.profileImage || avatarUrl,
            },
          });
        }
      }

      // 3. Still no user? Create a new one.
      if (!user) {
        console.log(`[ensureUser] Creating new user for Supabase ID: ${supabaseUserId}, Email: ${email}`);
        user = await prisma.user.create({
          data: {
            supabaseuserid: supabaseUserId,
            email: email ?? `no-email-${supabaseUserId}@placeholder.local`,
            name: fullName || undefined,
            profileImage: avatarUrl || undefined,
          },
        });
      }
    }

    (req as any).appUserId = user.id;
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error('ensureUser error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
