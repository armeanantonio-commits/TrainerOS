import type { Request, Response } from 'express';
import * as openaiService from '../services/openai.service.js';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { getPlanLimits } from '../config/planLimits.js';
import {
  acquireGenerationLock,
  buildGenerationConflictPayload,
  releaseGenerationLock,
} from '../lib/generation-lock.js';
import { generateUniqueResult } from '../lib/generation-history.js';
import { normalizeLanguage } from '../lib/language.js';

const generateIdeaSchema = z.object({
  objective: z.enum(['lead-gen', 'engagement', 'education']).optional(),
});

const generateMultiFormatSchema = z.object({
  general: z.boolean().optional(),
});

const sceneSchema = z.object({
  scene: z.number().int().min(1).max(5),
  text: z.string().optional().default(''),
  visual: z.string().optional().default(''),
});

const regenerateSceneSchema = z.object({
  idea: z.object({
    format: z.enum(['REEL', 'CAROUSEL', 'STORY']),
    hook: z.string().min(3),
    script: z.array(sceneSchema).default([]),
    cta: z.string().min(3),
    dmKeyword: z.string().optional().default(''),
  }),
  targetScene: z.number().int().min(1).max(5),
});
const regenerateHookSchema = z.object({
  idea: z.object({
    format: z.enum(['REEL', 'CAROUSEL', 'STORY']),
    hook: z.string().min(3),
    script: z.array(sceneSchema).default([]),
    cta: z.string().min(3),
    dmKeyword: z.string().optional().default(''),
  }),
});

const structureIdeaSchema = z.object({
  ideaText: z.string().min(10).max(4000),
});
const translateIdeasSchema = z.object({
  targetLanguage: z.enum(['ro', 'en']),
  ideas: z.array(
    z.object({
      id: z.string().min(1),
      hook: z.string().optional().default(''),
      cta: z.string().optional().default(''),
      script: z.unknown().optional(),
    })
  ).max(20),
});

const RECENT_IDEA_CONTEXT_LIMIT = 12;
const prismaAny = prisma as any;

export async function generate(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = req.user;
    const language = normalizeLanguage(user.preferredLanguage);

    // Check if user has niche set
    if (!user.niche) {
      res.status(400).json({
        error: 'Niche not set',
        message: '🎯 Oprește! Trebuie să-ți setezi nișa înainte de a genera idei. Mergi la Niche Finder și completează profilul (2 minute).',
        nicheRequired: true,
      });
      return;
    }

    const niche = user.niche;

    // Check plan limits (skip for admins)
    if (!user.isAdmin) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

      const ideasThisMonth = await prisma.idea.count({
        where: {
          userId: user.id,
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
      });

      const limits = getPlanLimits(user.plan);
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
    const generationKey = acquireGenerationLock(user.id, 'daily-idea');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('daily-idea'));
      return;
    }

    try {
      const recentIdeas = await prisma.idea.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: RECENT_IDEA_CONTEXT_LIMIT,
        select: {
          format: true,
          hook: true,
          script: true,
          cta: true,
          objective: true,
          conversionRate: true,
          leadMagnet: true,
          dmKeyword: true,
          reasoning: true,
          createdAt: true,
        },
      });

      const recentIdeaContext = recentIdeas.map((idea) => ({
        format: idea.format || 'UNKNOWN',
        hook: idea.hook || '',
        cta: idea.cta || '',
        createdAt: idea.createdAt.toISOString(),
      }));

      const result = await generateUniqueResult({
        userId: user.id,
        section: 'daily-idea',
        persistentValues: recentIdeas.map((idea) => ({
          format: idea.format,
          hook: idea.hook,
          script: idea.script,
          cta: idea.cta,
          objective: idea.objective,
          conversionRate: idea.conversionRate,
          leadMagnet: idea.leadMagnet,
          dmKeyword: idea.dmKeyword,
          reasoning: idea.reasoning,
        })),
        generate: ({ recentOutputs, duplicateAttempt }) => openaiService.generateDailyIdea({
          niche,
          icpProfile: user.icpProfile,
          contentPreferences: user.contentPreferences,
          objective: data.objective,
          language,
          recentIdeas: recentIdeaContext,
          generationContext: {
            recentOutputs,
            duplicateAttempt,
          },
        }),
      });

      // Save idea to database
      const idea = await prisma.idea.create({
        data: {
          userId: user.id,
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
    } finally {
      releaseGenerationLock(generationKey);
    }
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

    const user = req.user;
    const language = normalizeLanguage(user.preferredLanguage);
    const data = generateMultiFormatSchema.parse(req.body ?? {});
    const useGeneralIdea = data.general === true;
    const ideaNiche = useGeneralIdea
      ? 'fitness general pentru adulți din România care vor rezultate sustenabile'
      : user.niche;

    // Check if user has niche unless the user explicitly requests a general idea
    if (!ideaNiche) {
      res.status(400).json({
        error: 'Niche not set',
        message: 'Setează nișa sau folosește opțiunea de idee generală.',
      });
      return;
    }

    const generationKey = acquireGenerationLock(user.id, 'daily-idea');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('daily-idea'));
      return;
    }

    try {

      // Check monthly set limit by plan (skip for admins)
      if (!user.isAdmin) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const nextMonthStart = new Date(monthStart);
        nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

        const generationsThisMonth = await prisma.idea.count({
          where: {
            userId: user.id,
            createdAt: {
              gte: monthStart,
              lt: nextMonthStart,
            },
          },
        });

        const multiFormatCallsThisMonth = Math.floor(generationsThisMonth / 3);
        const monthlySetLimit = getPlanLimits(user.plan).ideaSetsPerMonth;

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
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: RECENT_IDEA_CONTEXT_LIMIT,
        select: {
          format: true,
          hook: true,
          script: true,
          cta: true,
          objective: true,
          conversionRate: true,
          leadMagnet: true,
          dmKeyword: true,
          reasoning: true,
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
      const result = await generateUniqueResult({
        userId: user.id,
        section: 'daily-idea',
        persistentValues: recentIdeas.map((idea) => ({
          format: idea.format,
          hook: idea.hook,
          script: idea.script,
          cta: idea.cta,
          objective: idea.objective,
          conversionRate: idea.conversionRate,
          leadMagnet: idea.leadMagnet,
          dmKeyword: idea.dmKeyword,
          reasoning: idea.reasoning,
        })),
        generate: ({ recentOutputs, duplicateAttempt }) => openaiService.generateMultiFormatIdea({
          niche: ideaNiche,
          icpProfile: useGeneralIdea ? undefined : user.icpProfile,
          contentPreferences: user.contentPreferences,
          objective: 'lead-gen',
          recentIdeas: recentIdeaContext,
          general: useGeneralIdea,
          language,
          generationContext: {
            recentOutputs,
            duplicateAttempt,
          },
        }),
      });

      // Save all 3 ideas to database
      const ideas = await Promise.all([
        prisma.idea.create({
          data: {
            userId: user.id,
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
            userId: user.id,
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
            userId: user.id,
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
    } finally {
      releaseGenerationLock(generationKey);
    }
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

    const user = req.user;
    const language = normalizeLanguage(user.preferredLanguage);

    if (!user.niche) {
      res.status(400).json({
        error: 'Niche not set',
        message: 'Completează Niche Finder înainte să structurezi ideea.',
        nicheRequired: true,
      });
      return;
    }

    const niche = user.niche;

    if (!user.isAdmin) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

      const structuredThisMonth = await prismaAny.ideaStructureGeneration.count({
        where: {
          userId: user.id,
          createdAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
      });

      const monthlyStructureLimit = getPlanLimits(user.plan).structuredIdeasPerMonth;
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
    const generationKey = acquireGenerationLock(user.id, 'idea-structurer');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('idea-structurer'));
      return;
    }

    try {
      const result = await generateUniqueResult({
        userId: user.id,
        section: 'idea-structurer',
        generate: ({ recentOutputs, duplicateAttempt }) => openaiService.structureUserIdea({
          ideaText: data.ideaText,
          niche,
          contentPreferences: user.contentPreferences,
          language,
          generationContext: {
            recentOutputs,
            duplicateAttempt,
          },
        }),
      });

      await prismaAny.ideaStructureGeneration.create({
        data: {
          userId: user.id,
          ideaText: data.ideaText,
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
    res.status(500).json({ error: error.message || 'Failed to structure idea' });
  }
}

export async function translate(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = translateIdeasSchema.parse(req.body);
    const result = await openaiService.translateIdeas({
      targetLanguage: normalizeLanguage(data.targetLanguage),
      ideas: data.ideas,
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to translate ideas' });
  }
}

export async function regenerateScene(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = req.user;
    const language = normalizeLanguage(user.preferredLanguage);
    const data = regenerateSceneSchema.parse(req.body ?? {});
    const ideaNiche = user.niche || 'fitness general pentru adulți din România care vor rezultate sustenabile';
    const generationKey = acquireGenerationLock(user.id, 'daily-idea');

    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('daily-idea'));
      return;
    }

    try {
      const regenerated = await openaiService.regenerateDailyIdeaScene({
        niche: ideaNiche,
        format: data.idea.format,
        hook: data.idea.hook,
        cta: data.idea.cta,
        dmKeyword: data.idea.dmKeyword || '',
        script: data.idea.script.map((scene) => ({
          scene: scene.scene,
          text: scene.text || '',
          visual: scene.visual || '',
        })),
        targetScene: data.targetScene,
        contentPreferences: user.contentPreferences,
        language,
      });

      res.json({ scene: regenerated });
    } finally {
      releaseGenerationLock(generationKey);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to regenerate scene' });
  }
}

export async function regenerateHook(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = req.user;
    const language = normalizeLanguage(user.preferredLanguage);
    const data = regenerateHookSchema.parse(req.body ?? {});
    const useGeneralIdea = !user.niche;
    const ideaNiche = useGeneralIdea
      ? 'fitness general pentru adulți din România care vor rezultate sustenabile'
      : user.niche!;
    const generationKey = acquireGenerationLock(user.id, 'daily-idea');

    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('daily-idea'));
      return;
    }

    try {
      const recentIdeas = await prisma.idea.findMany({
        where: { userId: user.id },
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

      // Use the same robust generator as initial Daily Idea generation.
      const generated = await openaiService.generateMultiFormatIdea({
        niche: ideaNiche,
        icpProfile: useGeneralIdea ? undefined : user.icpProfile,
        contentPreferences: user.contentPreferences,
        objective: 'lead-gen',
        recentIdeas: recentIdeaContext,
        general: useGeneralIdea,
        language,
      });

      const formatKey =
        data.idea.format === 'REEL'
          ? 'reel'
          : data.idea.format === 'CAROUSEL'
            ? 'carousel'
            : 'story';
      const regeneratedHook = generated[formatKey]?.hook || data.idea.hook;

      res.json({ hook: regeneratedHook });
    } finally {
      releaseGenerationLock(generationKey);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to regenerate hook' });
  }
}

export default {
  generate,
  generateMultiFormat,
  getHistory,
  getById,
  structure,
  translate,
  regenerateScene,
  regenerateHook,
};
