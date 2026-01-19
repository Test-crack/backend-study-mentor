// src/middleware/rbac.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRoleType } from '@prisma/client';

export function authorize(...roles: UserRoleType[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.userRole) {
            return res.status(403).json({ message: 'Access denied: No role assigned' });
        }

        if (!roles.includes(req.userRole)) {
            return res.status(403).json({
                message: `Access denied: Required roles: [${roles.join(', ')}]. Your role: ${req.userRole}`
            });
        }

        next();
    };
}
