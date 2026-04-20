import type { Request, Response } from 'express';
import * as openaiService from '../services/openai.service.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const quickNicheSchema = z.object({
  quickNiche: z.string().min(5),
  saveToProfile: z.boolean().optional().default(false),
});

const presetNicheSelectionSchema = z.object({
  niche: z.string().min(5),
  description: z.string().optional().default(''),
});

const quickICPSchema = z.object({
  gender: z.enum(['femei', 'barbati', 'ambele']),
  ageRanges: z.array(z.string()).min(1),
  customAgeRange: z.string().optional().default(''),
  wakeUpTime: z.string().optional().default(''),
  jobType: z.enum(['sedentar', 'activ', 'mixt']).optional(),
  sittingTime: z.enum(['<4h', '4-6h', '6-8h', '8h+']).optional(),
  morning: z.array(z.string()).optional().default([]),
  lunch: z.array(z.string()).optional().default([]),
  evening: z.array(z.string()).optional().default([]),
  definingSituations: z.array(z.string()).optional().default([]),
  kidsImpact: z.array(z.string()).optional().default([]),
  activeStatus: z.array(z.string()).optional().default([]),
  physicalJobIssue: z.array(z.string()).optional().default([]),
  painDetails: z.array(z.string()).optional().default([]),
  mainReasons: z.array(z.string()).optional().default([]),
  primaryReason: z.string().optional().default(''),
  differentiation: z.string().optional().default(''),
  internalObjections: z.array(z.string()).max(2).optional().default([]),
  saveToProfile: z.boolean().optional().default(false),
});

const wizardNicheSchema = z.object({
  q1: z.string(),
  q2: z.string(),
  q3: z.string(),
  q4: z.string(),
  q5: z.string(),
  saveToProfile: z.boolean().optional().default(false),
});

const nicheVariantsSchema = z.object({
  gender: z.enum(['femei', 'barbati', 'ambele']),
  ageRanges: z.array(z.string()).min(1),
  valueSituations: z.array(z.string()).min(1),
  commonProblems: z.array(z.string()).min(1),
  primaryOutcome: z.string().min(2),
  avoidContent: z.array(z.string()).optional().default([]),
});

const discoverNicheSchema = z.object({
  // Phase A
  gender: z.enum(['femei', 'barbati', 'ambele']),
  ageRanges: z.array(z.string()).min(1),
  valueSituations: z.array(z.string()).min(1),
  commonProblems: z.array(z.string()).min(1),
  primaryOutcome: z.string().min(2),
  avoidContent: z.array(z.string()).optional().default([]),
  // Selected niche
  selectedNiche: z.string().min(5),
  // Phase C
  awarenessLevel: z.string().optional().default(''),
  identityStory: z.string().optional().default(''),
  clientStatement: z.string().min(2),
  dominantGoals: z.array(z.string()).min(1),
  primaryGoal: z.string().min(2),
  wakeUpTime: z.string().optional().default(''),
  jobType: z.enum(['sedentar', 'activ', 'mixt']).optional(),
  sittingTime: z.enum(['<4h', '4-6h', '6-8h', '8h+']).optional(),
  morning: z.array(z.string()).optional().default([]),
  lunch: z.array(z.string()).optional().default([]),
  evening: z.array(z.string()).optional().default([]),
  definingSituations: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
  saveToProfile: z.boolean().optional().default(false),
});

const icpDaySchema = z.object({
  gender: z.enum(['femei', 'barbati', 'ambele']),
  ageRanges: z.array(z.string()).min(1),
  wakeUpTime: z.string().optional().default(''),
  jobType: z.enum(['sedentar', 'activ', 'mixt']).optional(),
  sittingTime: z.enum(['<4h', '4-6h', '6-8h', '8h+']).optional(),
  morning: z.array(z.string()).optional().default([]),
  lunch: z.array(z.string()).optional().default([]),
  evening: z.array(z.string()).optional().default([]),
  definingSituations: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
});

const brandVoiceSchema = z.object({
  perception: z.array(z.string()).min(1).max(2),
  naturalStyle: z.enum([
    'Simplu, pe înțelesul tuturor',
    'Mix: simplu + un pic tehnic',
    'Mai tehnic (pentru oameni deja avansați)',
  ]),
  neverDo: z.array(z.string()).min(1).max(2),
  principles: z.array(z.string()).min(1).max(2),
  customPrinciple: z.string().optional().default(''),
  ctaStyle: z.enum([
    'Soft (comentariu / întrebare)',
    'Direct (scrie-mi X / trimite mesaj)',
    'Educațional (salvează / share)',
    'Mix',
  ]),
  brandWords: z.array(z.string()).min(3).max(3),
  frequentPhrases: z.string().optional().default(''),
  humorTone: z.enum([
    'Deloc',
    'Subtil / ironic light',
    'Relatable (POV, situații)',
    'Direct și mai provocator (fără jigniri)',
  ]).optional(),
});

const contentCreationSchema = z.object({
  filmingLocation: z.enum([
    'Acasă',
    'La sală',
    'Ambele (în funcție de zi)',
  ]),
  naturalContentTypes: z.array(z.enum([
    'Educațional – nutriție',
    'Educațional – exerciții / antrenamente',
    'Relatable / funny',
    'Story / experiență personală',
  ])).min(1),
  otherNaturalFormat: z.string().optional().default(''),
  deliveryStyles: z.array(z.enum([
    'Vorbit direct la cameră',
    'Voice-over peste video',
    'Text + B-roll (fără vorbit)',
    'Mix, în funcție de zi',
  ])).min(1),
});

const contentPreferencesSchema = z.object({
  type: z.enum(['brand-voice', 'content-creation', 'combined']).optional(),
  version: z.number().int().optional(),
  completedAt: z.string().optional(),
  brandVoice: brandVoiceSchema.optional(),
  contentCreation: contentCreationSchema.optional(),
}).refine(
  (data) => !!data.brandVoice || !!data.contentCreation,
  { message: 'At least one preferences section is required.' },
);

export async function generateQuick(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = quickNicheSchema.parse(req.body);
    const result = await openaiService.generateNicheQuick(data);

    // Save to user profile
    if (data.saveToProfile) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          niche: result.niche,
          icpProfile: result.idealClient,
          positioningMessage: result.positioning,
        },
      });
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate niche' });
  }
}

export async function savePresetNicheSelection(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = presetNicheSelectionSchema.parse(req.body);
    const generatedProfile = await openaiService.generateNicheQuick({
      quickNiche: data.niche,
    });

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        niche: data.niche,
        icpProfile: generatedProfile.idealClient || Prisma.JsonNull,
        positioningMessage: generatedProfile.positioning || data.description || null,
      },
    });

    res.json({
      message: 'Preset niche saved successfully',
      niche: data.niche,
      idealClient: generatedProfile.idealClient,
      positioning: generatedProfile.positioning,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to save preset niche' });
  }
}

export async function generateWizard(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = wizardNicheSchema.parse(req.body);
    const result = await openaiService.generateNicheWizard(data);

    // Save to user profile
    if (data.saveToProfile) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          niche: result.niche,
          icpProfile: result.idealClient,
          positioningMessage: result.positioning,
        },
      });
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate niche' });
  }
}

export async function generateDiscover(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = discoverNicheSchema.parse(req.body);
    const result = await openaiService.generateNicheDiscover(data);

    // Save to user profile
    if (data.saveToProfile) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          niche: result.niche,
          icpProfile: result.idealClient,
          positioningMessage: result.positioning,
        },
      });
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate niche' });
  }
}

export async function generateICPDay(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = icpDaySchema.parse(req.body);
    const result = await openaiService.generateICPDay(data);

    // Save ICP profile to user
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        icpProfile: result.icpProfile,
      },
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate Niche Builder' });
  }
}

export async function generateNicheVariants(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = nicheVariantsSchema.parse(req.body);
    const result = await openaiService.generateNicheVariants(data);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate niche variants' });
  }
}

export async function generatePresetNiches(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await openaiService.generatePresetNicheOptions();

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate preset niches' });
  }
}

export async function generateQuickICP(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = quickICPSchema.parse(req.body);
    const result = await openaiService.generateNicheQuickICP(data);

    // Save to user profile
    if (data.saveToProfile) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          niche: result.niche,
          icpProfile: result.idealClient,
          positioningMessage: result.positioning,
        },
      });
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to generate niche' });
  }
}

export async function resetNiche(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Reset niche-related fields to null
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        niche: null,
        icpProfile: Prisma.DbNull,
        positioningMessage: null,
        brandKit: Prisma.DbNull,
        toneOfVoice: null,
      },
    });

    res.json({
      success: true,
      message: 'Niche reset successfully',
    });
  } catch (error: any) {
    console.error('Reset niche error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset niche' });
  }
}

export async function saveContentPreferences(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const contentPreferences = contentPreferencesSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { contentPreferences: true },
    });

    const existingPreferences =
      existingUser?.contentPreferences &&
      typeof existingUser.contentPreferences === 'object' &&
      !Array.isArray(existingUser.contentPreferences)
        ? (existingUser.contentPreferences as Record<string, unknown>)
        : {};

    const mergedPreferences = {
      ...existingPreferences,
      ...contentPreferences,
      ...(contentPreferences.brandVoice ? { brandVoice: contentPreferences.brandVoice } : {}),
      ...(contentPreferences.contentCreation ? { contentCreation: contentPreferences.contentCreation } : {}),
    };

    // Update user with content preferences
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        contentPreferences: mergedPreferences as any,
      },
    });

    res.json({
      success: true,
      message: 'Content preferences saved successfully',
      contentPreferences: updatedUser.contentPreferences,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Save content preferences error:', error);
    res.status(500).json({ error: error.message || 'Failed to save content preferences' });
  }
}

export async function getContentPreferences(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { contentPreferences: true },
    });

    res.json({
      success: true,
      contentPreferences: user?.contentPreferences ?? null,
    });
  } catch (error: any) {
    console.error('Get content preferences error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch content preferences' });
  }
}

export default {
  generateQuick,
  savePresetNicheSelection,
  generateQuickICP,
  generateWizard,
  generateNicheVariants,
  generatePresetNiches,
  generateDiscover,
  generateICPDay,
  resetNiche,
  saveContentPreferences,
  getContentPreferences,
};
