import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service.js';
import type { User } from '@prisma/client';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[auth] Missing bearer token for ${req.method} ${req.originalUrl}`);
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const user = await verifyToken(token);

    req.user = user;
    next();
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown auth error';
    console.warn(`[auth] Authentication failed for ${req.method} ${req.originalUrl}: ${reason}`);
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requirePlan(...allowedPlans: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Admins bypass all plan checks and expiration checks.
    if (req.user.isAdmin) {
      next();
      return;
    }

    // Check if user's plan is in allowed plans
    if (!allowedPlans.includes(req.user.plan)) {
      res.status(403).json({
        error: 'Plan upgrade required',
        requiredPlans: allowedPlans,
        currentPlan: req.user.plan,
      });
      return;
    }

    // Check if trial expired
    if (req.user.plan === 'FREE_TRIAL' && req.user.trialEndsAt) {
      if (new Date() > req.user.trialEndsAt) {
        res.status(403).json({
          error: 'Free trial expired',
          message: 'Please upgrade to continue using TrainerOS',
        });
        return;
      }
    }

    // Check if paid plan expired
    if (req.user.planExpiresAt && new Date() > req.user.planExpiresAt) {
      res.status(403).json({
        error: 'Subscription expired',
        message: 'Please renew your subscription',
      });
      return;
    }

    next();
  };
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

export default {
  authenticate,
  requirePlan,
  requireAdmin,
};
