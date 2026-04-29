import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import * as openaiService from '../services/openai.service.js';
import { getPlanLimits } from '../config/planLimits.js';
import {
  acquireGenerationLock,
  buildGenerationConflictPayload,
  releaseGenerationLock,
} from '../lib/generation-lock.js';
import { generateUniqueResult } from '../lib/generation-history.js';
import { normalizeLanguage } from '../lib/language.js';

const generateEmailSchema = z.object({
  topic: z.string().min(5).max(300),
  objective: z.enum(['lead-magnet', 'nurture', 'sales', 'reengagement']).default('nurture'),
  emailType: z.enum(['single', 'welcome', 'promo', 'newsletter']).default('single'),
  tone: z.enum(['direct', 'empathetic', 'authoritative', 'friendly']).default('friendly'),
  offer: z.string().max(400).optional().default(''),
  audiencePain: z.string().max(400).optional().default(''),
  ctaGoal: z.string().max(200).optional().default(''),
  language: z.enum(['ro', 'en']).default('ro'),
});

export async function generateEmail(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userSession = req.user;
    const payload = generateEmailSchema.parse(req.body);
    const language = req.body?.language ? payload.language : normalizeLanguage(userSession.preferredLanguage);
    const generationKey = acquireGenerationLock(userSession.id, 'email-marketing');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('email-marketing'));
      return;
    }

    try {
      if (!userSession.isAdmin) {
        const monthlyEmailLimit = getPlanLimits(userSession.plan).emailsPerMonth;
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const nextMonthStart = new Date(monthStart);
        nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

        const emailsGeneratedThisMonth = await prisma.emailGeneration.count({
          where: {
            userId: userSession.id,
            createdAt: {
              gte: monthStart,
              lt: nextMonthStart,
            },
          },
        });

        if (emailsGeneratedThisMonth >= monthlyEmailLimit) {
          res.status(429).json({
            error: 'Monthly email limit reached',
            message: `Ai atins limita de ${monthlyEmailLimit} emailuri generate pe luna curentă.`,
            generatedThisMonth: emailsGeneratedThisMonth,
            limit: monthlyEmailLimit,
          });
          return;
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: userSession.id },
        select: {
          name: true,
          niche: true,
          icpProfile: true,
          positioningMessage: true,
          contentPreferences: true,
        },
      });

      const result = await generateUniqueResult({
        userId: userSession.id,
        section: 'email-marketing',
        generate: ({ recentOutputs, duplicateAttempt }) => openaiService.generateMarketingEmail({
          topic: payload.topic,
          objective: payload.objective,
          emailType: payload.emailType,
          tone: payload.tone,
          offer: payload.offer,
          audiencePain: payload.audiencePain,
          ctaGoal: payload.ctaGoal,
          language,
          generationContext: {
            recentOutputs,
            duplicateAttempt,
          },
          userContext: {
            name: user?.name || userSession.name || '',
            niche: user?.niche || userSession.niche || '',
            icpProfile: user?.icpProfile || userSession.icpProfile || '',
            positioningMessage: user?.positioningMessage || userSession.positioningMessage || '',
            contentPreferences: user?.contentPreferences || userSession.contentPreferences || null,
          },
        }),
      });

      await prisma.emailGeneration.create({
        data: {
          userId: userSession.id,
          topic: payload.topic,
          objective: payload.objective,
          emailType: payload.emailType,
          tone: payload.tone,
          language,
        },
      });

      res.json(result);
    } finally {
      releaseGenerationLock(generationKey);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }

    res.status(500).json({ error: error.message || 'Failed to generate email' });
  }
}

export default {
  generateEmail,
};
