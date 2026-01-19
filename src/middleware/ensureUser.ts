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

    if (!supabaseUserId) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    let user = await prisma.user.findUnique({
      where: { supabaseuserid: supabaseUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          supabaseuserid: supabaseUserId,
          email: email ?? `no-email-${supabaseUserId}@placeholder.local`,
        },
      });
    }

    (req as any).appUserId = user.id;
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error('ensureUser error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
