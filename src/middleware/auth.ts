// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRoleType } from '@prisma/client';

export interface AuthRequest extends Request {
  supabaseUserId?: string;
  userEmail?: string;
  userRole?: UserRoleType;
  userMetadata?: any;
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[Auth] SUPABASE_JWT_SECRET is not set — all authenticated requests will fail.');
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as any;

    // Supabase JWT claims: sub = user UUID, email = user email, user_metadata = profile metadata
    req.supabaseUserId = payload.sub;
    req.userEmail      = payload.email ?? undefined;
    req.userMetadata   = payload.user_metadata ?? {};

    return next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    console.error('[Auth] Unexpected JWT error:', err);
    return res.status(401).json({ message: 'Authentication failed.' });
  }
}
