// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { UserRoleType } from '@prisma/client';

export interface AuthRequest extends Request {
  supabaseUserId?: string;
  userEmail?: string;
  userRole?: UserRoleType;
  userMetadata?: any;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      console.error('Supabase auth error:', error);
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.supabaseUserId = data.user.id;
    req.userEmail = data.user.email ?? undefined;
    req.userMetadata = data.user.user_metadata;

    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
