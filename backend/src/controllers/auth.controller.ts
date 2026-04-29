import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(120).optional(),
  preferredLanguage: z.enum(['ro', 'en']).optional(),
});

const activateAccountSchema = z.object({
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(401).json({ error: error.message || 'Login failed' });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { passwordHash, ...user } = req.user;
  res.json({ user });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = updateProfileSchema.parse(req.body);
    const updatedUser = await authService.updateProfile(req.user.id, data);
    const { passwordHash, ...user } = updatedUser;
    res.json({ user });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(400).json({ error: error.message || 'Profile update failed' });
  }
}

export async function activateAccount(req: Request, res: Response): Promise<void> {
  try {
    const data = activateAccountSchema.parse(req.body);
    const result = await authService.activateAccount(data.token);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(400).json({ error: error.message || 'Account activation failed' });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const data = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(data.email);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(400).json({ error: error.message || 'Could not process forgot password request' });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const data = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(data.token, data.password);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(400).json({ error: error.message || 'Password reset failed' });
  }
}

export default {
  register,
  login,
  me,
  updateProfile,
  activateAccount,
  forgotPassword,
  resetPassword,
};
