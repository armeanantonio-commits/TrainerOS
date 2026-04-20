import type { Request, Response } from 'express';
import * as openaiService from '../services/openai.service.js';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { getPlanLimits } from '../config/planLimits.js';

const generateIdeaSchema = z.object({
  objective: z.enum(['lead-gen', 'engagement', 'education']).optional(),
});

const generateMultiFormatSchema = z.object({
  general: z.boolean().optional(),
});

const structureIdeaSchema = z.object({
  ideaText: z.string().min(10).max(4000),
});

const RECENT_IDEA_CONTEXT_LIMIT = 12;
const prismaAny = prisma as any;

export async function generate(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if user has niche set
    if (!req.user.niche) {
      res.status(400).json({
        error: 'Niche not set',
        message: '🎯 Oprește! Trebuie să-ți setezi nișa înainte de a genera idei. Mergi la Niche Finder și completează profilul (2 minute).',
        nicheRequired: true,
      });
      return;
    }

    // Check plan limits (skip for admins)
    if (!req.user.isAdmin) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

      const ideasThisMonth = await prisma.idea.count({
        where: {
          userId: req.user.id,
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
      });

      const limits = getPlanLimits(req.user.plan);
      const monthlyIdeaEntriesLimit = limits.ideaSetsPerMonth * 3;
      if (ideasThisMonth >= monthlyIdeaEntriesLimit) {
        res.status(403).json({
          error: 'Monthly limit reached',
          message: `Ai atins limita de ${limits.ideaSetsPerMonth} seturi Daily Idea pe luna curentă.`,
        });
        return;
      }
    }

    const data = generateIdeaSchema.parse(req.body);

    const recentIdeas = await prisma.idea.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: RECENT_IDEA_CONTEXT_LIMIT,
      select: {
        format: true,
        hook: true,
        cta: true,
        createdAt: true,
      },
    });

    const recentIdeaContext = recentIdeas.map((idea) => ({
      format: idea.format || 'UNKNOWN',
      hook: idea.hook || '',
      cta: idea.cta || '',
      createdAt: idea.createdAt.toISOString(),
    }));

    const result = await openaiService.generateDailyIdea({
      niche: req.user.niche,
      icpProfile: req.user.icpProfile,
      contentPreferences: req.user.contentPreferences,
      objective: data.objective,
      recentIdeas: recentIdeaContext,
    });

    // Save idea to database
    const idea = await prisma.idea.create({
      data: {
        userId: req.user.id,
        format: result.format,
        hook: result.hook,
        script: result.script as any,
        cta: result.cta,
        objective: result.objective,
        conversionRate: result.conversionRate,
        leadMagnet: result.leadMagnet,
        dmKeyword: result.dmKeyword,
        reasoning: result.reasoning,
      },
    });

    res.json({ ...result, id: idea.id });
  } catch (error: any) {
    console.error('generateMultiFormat failed:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate idea' });
  }
}

export async function generateMultiFormat(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = generateMultiFormatSchema.parse(req.body ?? {});
    const useGeneralIdea = data.general === true;
    const ideaNiche = useGeneralIdea
      ? 'fitness general pentru adulți din România care vor rezultate sustenabile'
      : req.user.niche;

    // Check if user has niche unless the user explicitly requests a general idea
    if (!ideaNiche) {
      res.status(400).json({
        error: 'Niche not set',
        message: 'Setează nișa sau folosește opțiunea de idee generală.',
      });
      return;
    }

    // Check monthly set limit by plan (skip for admins)
    if (!req.user.isAdmin) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

      const generationsThisMonth = await prisma.idea.count({
        where: {
          userId: req.user.id,
          createdAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
      });

      const multiFormatCallsThisMonth = Math.floor(generationsThisMonth / 3);
      const monthlySetLimit = getPlanLimits(req.user.plan).ideaSetsPerMonth;

      if (multiFormatCallsThisMonth >= monthlySetLimit) {
        res.status(429).json({
          error: 'Monthly limit reached',
          message: `Ai atins limita de ${monthlySetLimit} seturi Daily Idea pe luna curentă.`,
          generationsThisMonth: multiFormatCallsThisMonth,
          limit: monthlySetLimit,
        });
        return;
      }
    }

    const recentIdeas = await prisma.idea.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: RECENT_IDEA_CONTEXT_LIMIT,
      select: {
        format: true,
        hook: true,
        cta: true,
        createdAt: true,
      },
    });

    const recentIdeaContext = recentIdeas.map((idea) => ({
      format: idea.format || 'UNKNOWN',
      hook: idea.hook || '',
      cta: idea.cta || '',
      createdAt: idea.createdAt.toISOString(),
    }));

    // Generate multi-format ideas
    const result = await openaiService.generateMultiFormatIdea({
      niche: ideaNiche,
      icpProfile: useGeneralIdea ? undefined : req.user.icpProfile,
      contentPreferences: req.user.contentPreferences,
      objective: 'lead-gen',
      recentIdeas: recentIdeaContext,
      general: useGeneralIdea,
    });

    // Save all 3 ideas to database
    const ideas = await Promise.all([
      prisma.idea.create({
        data: {
          userId: req.user.id,
          format: result.reel.format,
          hook: result.reel.hook,
          script: result.reel.script as any,
          cta: result.reel.cta,
          objective: result.reel.objective,
          conversionRate: result.reel.conversionRate,
          leadMagnet: result.reel.leadMagnet,
          dmKeyword: result.reel.dmKeyword,
          reasoning: result.reel.reasoning,
        },
      }),
      prisma.idea.create({
        data: {
          userId: req.user.id,
          format: result.carousel.format,
          hook: result.carousel.hook,
          script: result.carousel.script as any,
          cta: result.carousel.cta,
          objective: result.carousel.objective,
          conversionRate: result.carousel.conversionRate,
          leadMagnet: result.carousel.leadMagnet,
          dmKeyword: result.carousel.dmKeyword,
          reasoning: result.carousel.reasoning,
        },
      }),
      prisma.idea.create({
        data: {
          userId: req.user.id,
          format: result.story.format,
          hook: result.story.hook,
          script: result.story.script as any,
          cta: result.story.cta,
          objective: result.story.objective,
          conversionRate: result.story.conversionRate,
          leadMagnet: result.story.leadMagnet,
          dmKeyword: result.story.dmKeyword,
          reasoning: result.story.reasoning,
        },
      }),
    ]);

    res.json({
      reel: { ...result.reel, id: ideas[0].id },
      carousel: { ...result.carousel, id: ideas[1].id },
      story: { ...result.story, id: ideas[2].id },
      source: result.source || 'ai',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate idea' });
  }
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [ideas, total] = await Promise.all([
      prisma.idea.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.idea.count({ where: { userId: req.user.id } }),
    ]);

    res.json({
      ideas,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get ideas' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const idea = await prisma.idea.findFirst({
      where: {
        id,
        userId: req.user.id, // Only allow user to access their own ideas
      },
    });

    if (!idea) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }

    const windowMs = 2 * 60 * 1000;
    const start = new Date(idea.createdAt.getTime() - windowMs);
    const end = new Date(idea.createdAt.getTime() + windowMs);
    const group = await prisma.idea.findMany({
      where: {
        userId: req.user.id,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    res.json({ ...idea, group });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get idea' });
  }
}

export async function structure(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.user.niche) {
      res.status(400).json({
        error: 'Niche not set',
        message: 'Completează Niche Finder înainte să structurezi ideea.',
        nicheRequired: true,
      });
      return;
    }

    if (!req.user.isAdmin) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

      const structuredThisMonth = await prismaAny.ideaStructureGeneration.count({
        where: {
          userId: req.user.id,
          createdAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
      });

      const monthlyStructureLimit = getPlanLimits(req.user.plan).structuredIdeasPerMonth;
      if (structuredThisMonth >= monthlyStructureLimit) {
        res.status(429).json({
          error: 'Monthly structure limit reached',
          message: `Ai atins limita de ${monthlyStructureLimit} idei structurate pe luna curentă.`,
          generatedThisMonth: structuredThisMonth,
          limit: monthlyStructureLimit,
        });
        return;
      }
    }

    const data = structureIdeaSchema.parse(req.body);
    const result = await openaiService.structureUserIdea({
      ideaText: data.ideaText,
      niche: req.user.niche,
      contentPreferences: req.user.contentPreferences,
    });

    await prismaAny.ideaStructureGeneration.create({
      data: {
        userId: req.user.id,
        ideaText: data.ideaText,
      },
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to structure idea' });
  }
}

export default {
  generate,
  generateMultiFormat,
  getHistory,
  getById,
  structure,
};
