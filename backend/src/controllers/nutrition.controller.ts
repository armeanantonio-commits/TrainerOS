import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import * as openaiService from '../services/openai.service.js';
import {
  createNutritionReportPdf,
  generateNutritionReport,
  type GenerateNutritionReportInput,
} from '../services/nutrition-report.service.js';
import { sendNutritionReportEmail } from '../services/email.service.js';
import { getPlanLimits } from '../config/planLimits.js';
import {
  acquireGenerationLock,
  buildGenerationConflictPayload,
  releaseGenerationLock,
} from '../lib/generation-lock.js';
import { generateUniqueResult } from '../lib/generation-history.js';
import { normalizeLanguage } from '../lib/language.js';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const prismaAny = prisma as any;

const nutritionBaseShape = {
  calories: z.coerce.number().int().min(800).max(10000),
  proteinGrams: z.coerce.number().min(20).max(600),
  fatGrams: z.coerce.number().min(10).max(300),
  carbsGrams: z.coerce.number().min(20).max(1200),

  mealsPerDayType: z.enum(['3', '3+1', '4', '5', 'custom']),
  customMealsPerDay: z.coerce.number().int().min(1).max(12).optional(),

  macroDistributionType: z.enum([
    'equal',
    'around-workout',
    'more-evening-carbs',
    'low-carb-breakfast',
    'custom',
  ]),
  customMacroDistribution: z.string().trim().max(1000).optional().default(''),

  wakeUpTime: z.string().regex(timeRegex, 'Ora trezirii invalidă (format HH:MM)'),
  sleepTime: z.string().regex(timeRegex, 'Ora culcării invalidă (format HH:MM)'),
  hasTraining: z.boolean().default(true),
  trainingTime: z.string().regex(timeRegex, 'Ora antrenamentului invalidă (format HH:MM)').optional(),
  workProgram: z.enum(['fixed', 'shifts', 'flexible', 'mostly-home']).optional(),

  mealLocations: z.array(z.enum(['home', 'office', 'delivery', 'canteen', 'on-the-go'])).min(1).max(5),
  cookingLevel: z.enum(['daily', 'meal-prep', 'rare', 'almost-never']),
  foodBudget: z.enum(['low', 'medium', 'high']),

  dietaryRestrictions: z
    .array(
      z.enum([
        'lactose-free',
        'gluten-free',
        'vegetarian',
        'vegan',
        'intermittent-fasting',
        'religious-fasting',
        'allergies',
      ])
    )
    .max(7)
    .default([]),
  allergiesDetails: z.string().trim().max(1000).optional().default(''),
  excludedFoodsAndPreferences: z.string().trim().max(2000).optional().default(''),

  planStyle: z.enum(['exact-grams', 'macros-plus-examples', 'flexible-template', 'full-day-with-alternatives']),
} as const;

function addSharedNutritionValidation<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.superRefine((data: any, ctx) => {
    if (data.mealsPerDayType === 'custom' && !data.customMealsPerDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customMealsPerDay'],
        message: 'Completează numărul de mese pentru opțiunea personalizată.',
      });
    }

    if (data.mealsPerDayType !== 'custom' && data.customMealsPerDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customMealsPerDay'],
        message: 'Numărul personalizat de mese este permis doar pentru opțiunea "Alt număr".',
      });
    }

    if (!data.hasTraining && data.trainingTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trainingTime'],
        message: 'Nu trimite ora antrenamentului dacă clientul nu se antrenează.',
      });
    }

    if (data.hasTraining && !data.trainingTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trainingTime'],
        message: 'Completează ora antrenamentului sau selectează "Nu se antrenează".',
      });
    }

    if (data.macroDistributionType === 'custom' && !data.customMacroDistribution.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customMacroDistribution'],
        message: 'Completează distribuția personalizată a macro-urilor.',
      });
    }

    if (data.dietaryRestrictions.includes('allergies') && !data.allergiesDetails.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allergiesDetails'],
        message: 'Completează alergiile dacă ai selectat opțiunea "Alergii".',
      });
    }
  });
}

const generateNutritionSchema = addSharedNutritionValidation(z.object(nutritionBaseShape));

const generateNutritionReportSchema = addSharedNutritionValidation(
  z.object({
    ...nutritionBaseShape,
    clientName: z.string().trim().min(2).max(120),
    age: z.coerce.number().int().min(14).max(100),
    sex: z.enum(['male', 'female', 'other']),
    weightKg: z.coerce.number().min(30).max(400),
    heightCm: z.coerce.number().min(120).max(250),
    activityLevel: z.enum(['sedentary', 'lightly-active', 'moderately-active', 'very-active', 'athlete']),
    preferredEatingStyle: z.enum([
      'anything',
      'high-protein',
      'vegetarian',
      'vegan',
      'pescatarian',
      'mediterranean',
    ]),
    objective: z.enum(['lose-weight', 'maintain', 'gain-muscle', 'recomposition', 'performance']),
    goalWeightKg: z.coerce.number().min(30).max(400).optional(),
    targetDate: z.string().date().optional(),
    clientNotes: z.string().trim().max(2000).optional().default(''),
  })
);

async function ensureNutritionAllowance(req: Request): Promise<void> {
  if (!req.user) {
    throw new Error('Unauthorized');
  }

  if (req.user.isAdmin) {
    return;
  }

  const monthlyNutritionLimit = getPlanLimits(req.user.plan).nutritionPerMonth;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  const generatedThisMonth = await prismaAny.nutritionGeneration.count({
    where: {
      userId: req.user.id,
      createdAt: {
        gte: monthStart,
        lt: nextMonthStart,
      },
    },
  });

  if (generatedThisMonth >= monthlyNutritionLimit) {
    const error: any = new Error(`Ai atins limita de ${monthlyNutritionLimit} planuri de nutriție pe luna curentă.`);
    error.status = 429;
    error.payload = {
      error: 'Monthly nutrition limit reached',
      message: error.message,
      generatedThisMonth,
      limit: monthlyNutritionLimit,
    };
    throw error;
  }
}

function getMealsPerDay(payload: { mealsPerDayType: string; customMealsPerDay?: number }): number {
  return payload.mealsPerDayType === 'custom'
    ? payload.customMealsPerDay || 3
    : payload.mealsPerDayType === '3+1'
      ? 4
      : Number(payload.mealsPerDayType);
}

async function recordNutritionGeneration(
  userId: string,
  payload: {
    calories: number;
    proteinGrams: number;
    fatGrams: number;
    carbsGrams: number;
    mealsPerDayType: string;
    customMealsPerDay?: number;
  }
): Promise<void> {
  await prismaAny.nutritionGeneration.create({
    data: {
      userId,
      calories: payload.calories,
      proteinGrams: payload.proteinGrams,
      fatGrams: payload.fatGrams,
      carbsGrams: payload.carbsGrams,
      mealsPerDay: getMealsPerDay(payload),
    },
  });
}

export async function generateNutritionPlan(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureNutritionAllowance(req);

    const payload = generateNutritionSchema.parse(req.body);
    const language = normalizeLanguage(req.user.preferredLanguage);
    const generationKey = acquireGenerationLock(req.user.id, 'nutrition');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('nutrition'));
      return;
    }

    try {
      const result = await generateUniqueResult({
        userId: req.user.id,
        section: 'nutrition-plan',
        generate: ({ recentOutputs, duplicateAttempt }) =>
          openaiService.generateClientNutritionPlan({
            ...payload,
            language,
            generationContext: {
              recentOutputs,
              duplicateAttempt,
            },
          }),
      });

      await recordNutritionGeneration(req.user.id, payload);

      res.json(result);
    } finally {
      releaseGenerationLock(generationKey);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validare nutriție',
        details: error.errors,
      });
      return;
    }

    if (error?.status === 429 && error?.payload) {
      res.status(429).json(error.payload);
      return;
    }

    res.status(500).json({
      error: error.message || 'Failed to generate nutrition plan',
    });
  }
}

export async function generateNutritionReportPdfAndEmail(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureNutritionAllowance(req);

    const payload = generateNutritionReportSchema.parse(req.body) as GenerateNutritionReportInput;
    const language = normalizeLanguage(req.user.preferredLanguage);
    const generationKey = acquireGenerationLock(req.user.id, 'nutrition');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('nutrition'));
      return;
    }

    try {
      const report = await generateUniqueResult({
        userId: req.user.id,
        section: 'nutrition-report',
        generate: ({ recentOutputs, duplicateAttempt }) =>
          generateNutritionReport({
            ...payload,
            language,
            generationContext: {
              recentOutputs,
              duplicateAttempt,
            },
          }),
      });
      const pdf = await createNutritionReportPdf(payload, report);

      await sendNutritionReportEmail({
        to: req.user.email,
        recipientName: req.user.name ?? null,
        clientName: payload.clientName,
        pdfFilename: pdf.filename,
        pdfContentBase64: pdf.buffer.toString('base64'),
        downloadUrl: pdf.publicUrl,
      });

      await recordNutritionGeneration(req.user.id, payload);

      res.json({
        message: `Raportul PDF a fost generat și trimis la ${req.user.email}.`,
        emailedTo: req.user.email,
        pdfUrl: pdf.publicUrl,
        filename: pdf.filename,
        reportPreview: {
          title: report.reportTitle,
          summary: report.executiveSummary,
          calorieTarget: payload.calories,
          macroSummary: `P ${payload.proteinGrams} g | F ${payload.fatGrams} g | C ${payload.carbsGrams} g`,
          mealsPerDay: getMealsPerDay(payload),
        },
      });
    } finally {
      releaseGenerationLock(generationKey);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validare nutriție',
        details: error.errors,
      });
      return;
    }

    if (error?.status === 429 && error?.payload) {
      res.status(429).json(error.payload);
      return;
    }

    res.status(500).json({
      error: error.message || 'Failed to generate nutrition report',
    });
  }
}

export default {
  generateNutritionPlan,
  generateNutritionReportPdfAndEmail,
};
