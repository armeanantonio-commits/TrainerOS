import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import type { User, Plan } from '@prisma/client';
import crypto from 'crypto';
import { sendActivationEmail, sendPasswordResetEmail } from './email.service.js';
import { normalizeLanguage, type SupportedLanguage } from '../lib/language.js';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // string literal for jwt.sign expiresIn
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  email?: string;
  name?: string;
  preferredLanguage?: SupportedLanguage;
}

export interface AuthTokens {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    plan: Plan;
    isAdmin: boolean;
    preferredLanguage: SupportedLanguage;
  };
}

export interface RegisterResult {
  message: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createPlainToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildFrontendUrl(pathname: string, token: string): string {
  const base = FRONTEND_URL.replace(/\/+$/, '');
  const url = new URL(`${base}${pathname}`);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const normalizedEmail = normalizeEmail(input.email);

  // Check if user exists
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new Error('Email already registered');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, 10);
  const verificationToken = createPlainToken();
  const verificationTokenHash = hashToken(verificationToken);

  // Create user with free trial
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days trial

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: input.name,
      plan: 'FREE_TRIAL',
      trialEndsAt,
      isEmailVerified: false,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationTokenExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });

  const activationUrl = buildFrontendUrl('/activate-account', verificationToken);
  await sendActivationEmail(
    user.email,
    user.name ?? null,
    activationUrl
  );

  return { message: 'Registration successful. Please check your email to activate your account.' };
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  const normalizedEmail = normalizeEmail(input.email);

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Verify password
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  if (!user.isEmailVerified) {
    throw new Error('Please activate your account from the email link before logging in');
  }

  const loggedInUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      isAdmin: true,
      preferredLanguage: true,
    },
  });

  // Generate JWT
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
  const accessToken = jwt.sign(
    { userId: loggedInUser.id, email: loggedInUser.email },
    JWT_SECRET,
    options
  );

  return {
    accessToken,
    user: {
      id: loggedInUser.id,
      email: loggedInUser.email,
      name: loggedInUser.name,
      plan: loggedInUser.plan,
      isAdmin: loggedInUser.isAdmin,
      preferredLanguage: normalizeLanguage(loggedInUser.preferredLanguage),
    },
  };
}

export async function verifyToken(token: string): Promise<User> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
  const data: { email?: string; name?: string | null; preferredLanguage?: SupportedLanguage } = {};

  if (typeof input.email === 'string') {
    data.email = input.email.trim().toLowerCase();
  }

  if (typeof input.name === 'string') {
    const trimmedName = input.name.trim();
    data.name = trimmedName.length > 0 ? trimmedName : null;
  }

  if (input.preferredLanguage) {
    data.preferredLanguage = normalizeLanguage(input.preferredLanguage);
  }

  return prisma.user.update({
    where: { id: userId },
    data,
  });
}

export async function activateAccount(token: string): Promise<{ message: string }> {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    throw new Error('Invalid or expired activation token');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationTokenExpiresAt: null,
    },
  });

  return { message: 'Account activated successfully. You can now log in.' };
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  const resetToken = createPlainToken();
  const resetTokenHash = hashToken(resetToken);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: resetTokenHash,
      passwordResetTokenExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  const resetUrl = buildFrontendUrl('/reset-password', resetToken);
  await sendPasswordResetEmail(user.email, user.name ?? null, resetUrl);

  return { message: 'If the email exists, a reset link has been sent.' };
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const tokenHash = hashToken(token);

  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  return { message: 'Password reset successful. You can now log in.' };
}

export default {
  register,
  login,
  verifyToken,
  updateProfile,
  activateAccount,
  requestPasswordReset,
  resetPassword,
};
