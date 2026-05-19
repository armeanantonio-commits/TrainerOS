import type { Request, Response } from 'express';
import { Prisma, Plan } from '@prisma/client';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const paidPlans: Plan[] = ['STARTER', 'PRO', 'ELITE', 'MAX'];

const planMonthlyPriceMap: Record<Plan, number> = {
  FREE_TRIAL: 0,
  STARTER: 12.99,
  PRO: 19.9,
  ELITE: 79.99,
  MAX: 39.99,
};

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  plan: z.nativeEnum(Plan).optional(),
  status: z.enum(['active', 'trial', 'expired']).optional(),
});

const userProfileQuerySchema = z.object({
  historyLimit: z.coerce.number().int().min(5).max(100).default(25),
});

const updateUserSchema = z
  .object({
    plan: z.nativeEnum(Plan).optional(),
    isAdmin: z.boolean().optional(),
    isEmailVerified: z.boolean().optional(),
    planExpiresAt: z
      .union([z.string().datetime({ offset: true }), z.null()])
      .optional(),
  })
  .refine(
    (value) =>
      value.plan !== undefined ||
      value.isAdmin !== undefined ||
      value.isEmailVerified !== undefined ||
      value.planExpiresAt !== undefined,
    {
      message: 'At least one field is required',
    }
  );

async function getLastPaymentAtByEmail(email: string): Promise<string | null> {
  if (!stripe) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const invoices = await stripe.invoices.list({
    limit: 100,
    status: 'paid',
  });

  let latestPaidAt: string | null = null;

  for (const invoice of invoices.data) {
    const customerEmail = invoice.customer_email?.trim().toLowerCase();
    if (!customerEmail || customerEmail !== normalizedEmail) {
      continue;
    }

    const paidAtUnix = invoice.status_transitions?.paid_at ?? invoice.created;
    const paidAtIso = new Date(paidAtUnix * 1000).toISOString();

    if (!latestPaidAt || paidAtIso > latestPaidAt) {
      latestPaidAt = paidAtIso;
    }
  }

  return latestPaidAt;
}

function getStatusFilter(status: 'active' | 'trial' | 'expired'): Prisma.UserWhereInput {
  const now = new Date();

  if (status === 'active') {
    return {
      OR: [
        {
          plan: {
            in: paidPlans,
          },
          planExpiresAt: {
            gt: now,
          },
        },
        {
          plan: 'FREE_TRIAL',
          trialEndsAt: {
            gt: now,
          },
        },
      ],
    };
  }

  if (status === 'trial') {
    return {
      plan: 'FREE_TRIAL',
      trialEndsAt: {
        gt: now,
      },
    };
  }

  return {
    OR: [
      {
        plan: {
          in: paidPlans,
        },
        planExpiresAt: {
          lte: now,
        },
      },
      {
        plan: 'FREE_TRIAL',
        trialEndsAt: {
          lte: now,
        },
      },
    ],
  };
}

export async function getOverview(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const [
      totalUsers,
      planCounts,
      newUsersLast7Days,
      ideasGeneratedLast30Days,
      feedbackGeneratedLast30Days,
      expiringSubscriptions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({
        by: ['plan'],
        _count: {
          _all: true,
        },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
        },
      }),
      prisma.idea.count({
        where: {
          createdAt: {
            gte: startOfMonth,
          },
        },
      }),
      prisma.feedback.count({
        where: {
          createdAt: {
            gte: startOfMonth,
          },
        },
      }),
      prisma.user.count({
        where: {
          plan: {
            in: paidPlans,
          },
          planExpiresAt: {
            gte: now,
            lte: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
          },
        },
      }),
    ]);

    const mrr = planCounts.reduce((sum, row) => {
      return sum + planMonthlyPriceMap[row.plan] * row._count._all;
    }, 0);

    const countsByPlan = {
      FREE_TRIAL: 0,
      STARTER: 0,
      PRO: 0,
      ELITE: 0,
      MAX: 0,
    };

    for (const row of planCounts) {
      countsByPlan[row.plan] = row._count._all;
    }

    res.json({
      metrics: {
        totalUsers,
        newUsersLast7Days,
        ideasGeneratedThisMonth: ideasGeneratedLast30Days,
        feedbackGeneratedThisMonth: feedbackGeneratedLast30Days,
        estimatedMrr: Math.round(mrr * 100) / 100,
        expiringSubscriptions7Days: expiringSubscriptions,
      },
      planDistribution: countsByPlan,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load overview' });
  }
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const parsed = listUsersQuerySchema.parse(req.query);

    const where: Prisma.UserWhereInput = {};

    if (parsed.search) {
      where.OR = [
        { email: { contains: parsed.search, mode: 'insensitive' } },
        { name: { contains: parsed.search, mode: 'insensitive' } },
      ];
    }

    if (parsed.plan) {
      where.plan = parsed.plan;
    }

    if (parsed.status) {
      const statusFilter = getStatusFilter(parsed.status);
      where.AND = [statusFilter];
    }

    const skip = (parsed.page - 1) * parsed.limit;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: parsed.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          isEmailVerified: true,
          isAdmin: true,
          plan: true,
          planExpiresAt: true,
          trialEndsAt: true,
          lastIdeaGeneratedAt: true,
          lastLoginAt: true,
          ideasGeneratedThisMonth: true,
          feedbacksThisMonth: true,
          createdAt: true,
          updatedAt: true,
          ideas: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              format: true,
              hook: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const lastPaymentByEmail = new Map<string, string>();

    if (stripe && users.length > 0) {
      const invoices = await stripe.invoices.list({
        limit: 100,
        status: 'paid',
      });

      for (const invoice of invoices.data) {
        const customerEmail = invoice.customer_email?.trim().toLowerCase();
        if (!customerEmail) {
          continue;
        }

        const paidAtUnix = invoice.status_transitions?.paid_at ?? invoice.created;
        const paidAtIso = new Date(paidAtUnix * 1000).toISOString();
        const current = lastPaymentByEmail.get(customerEmail);
        if (!current || paidAtIso > current) {
          lastPaymentByEmail.set(customerEmail, paidAtIso);
        }
      }
    }

    const usersWithBilling = users.map((user) => {
      const [lastIdea] = user.ideas;
      const { ideas, ...rest } = user;

      return {
        ...rest,
        lastIdea: lastIdea
          ? {
              id: lastIdea.id,
              format: lastIdea.format,
              hook: lastIdea.hook,
              createdAt: lastIdea.createdAt,
            }
          : null,
        lastPaymentAt: lastPaymentByEmail.get(user.email.trim().toLowerCase()) ?? null,
      };
    });

    res.json({
      users: usersWithBilling,
      pagination: {
        total,
        page: parsed.page,
        limit: parsed.limit,
        totalPages: Math.ceil(total / parsed.limit),
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }

    res.status(500).json({ error: error.message || 'Failed to load users' });
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const payload = updateUserSchema.parse(req.body);

    if (!userId) {
      res.status(400).json({ error: 'User id is required' });
      return;
    }

    if (req.user?.id === userId && payload.isAdmin === false) {
      res.status(400).json({ error: 'Cannot remove your own admin access' });
      return;
    }

    const data: Prisma.UserUpdateInput = {};

    if (payload.plan !== undefined) {
      data.plan = payload.plan;
    }

    if (payload.isAdmin !== undefined) {
      data.isAdmin = payload.isAdmin;
    }

    if (payload.isEmailVerified !== undefined) {
      data.isEmailVerified = payload.isEmailVerified;
    }

    if (payload.planExpiresAt !== undefined) {
      data.planExpiresAt = payload.planExpiresAt ? new Date(payload.planExpiresAt) : null;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        niche: true,
        isEmailVerified: true,
        isAdmin: true,
        plan: true,
        planExpiresAt: true,
        trialEndsAt: true,
        updatedAt: true,
      },
    });

    res.json({ user });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }

    if (error?.code === 'P2025') {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
}

export async function getUserProfile(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { historyLimit } = userProfileQuerySchema.parse(req.query);

    if (!userId) {
      res.status(400).json({ error: 'User id is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isEmailVerified: true,
        isAdmin: true,
        plan: true,
        planExpiresAt: true,
        trialEndsAt: true,
        lastIdeaGeneratedAt: true,
        lastLoginAt: true,
        ideasGeneratedThisMonth: true,
        feedbacksThisMonth: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      ideasTotal,
      feedbacksTotal,
      emailsTotal,
      nutritionTotal,
      ideaStructuresTotal,
      chatMessagesTotal,
      calendarEntriesTotal,
      emailsThisMonth,
      nutritionThisMonth,
      ideaStructuresThisMonth,
      chatMessagesThisMonth,
      calendarEntriesThisMonth,
      lastPaymentAt,
      recentIdeas,
      recentFeedbacks,
      recentEmails,
      recentNutritionPlans,
      recentIdeaStructures,
      recentChatMessages,
      recentCalendarEntries,
    ] = await Promise.all([
      prisma.idea.count({ where: { userId } }),
      prisma.feedback.count({ where: { userId } }),
      prisma.emailGeneration.count({ where: { userId } }),
      prisma.nutritionGeneration.count({ where: { userId } }),
      prisma.ideaStructureGeneration.count({ where: { userId } }),
      prisma.chatMessageUsage.count({ where: { userId } }),
      prisma.calendarEntry.count({ where: { userId } }),
      prisma.emailGeneration.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
      prisma.nutritionGeneration.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
      prisma.ideaStructureGeneration.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
      prisma.chatMessageUsage.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
      prisma.calendarEntry.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
      getLastPaymentAtByEmail(user.email),
      prisma.idea.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          format: true,
          hook: true,
          objective: true,
          createdAt: true,
        },
      }),
      prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          fileType: true,
          fileName: true,
          overallScore: true,
          summary: true,
          createdAt: true,
        },
      }),
      prisma.emailGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          topic: true,
          objective: true,
          emailType: true,
          tone: true,
          language: true,
          createdAt: true,
        },
      }),
      prisma.nutritionGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          calories: true,
          proteinGrams: true,
          fatGrams: true,
          carbsGrams: true,
          mealsPerDay: true,
          createdAt: true,
        },
      }),
      prisma.ideaStructureGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          ideaText: true,
          createdAt: true,
        },
      }),
      prisma.chatMessageUsage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          message: true,
          createdAt: true,
        },
      }),
      prisma.calendarEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: historyLimit,
        select: {
          id: true,
          title: true,
          format: true,
          status: true,
          date: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      user: {
        ...user,
        lastPaymentAt,
      },
      usage: {
        ideasTotal,
        feedbacksTotal,
        emailsTotal,
        nutritionTotal,
        ideaStructuresTotal,
        chatMessagesTotal,
        calendarEntriesTotal,
        ideasThisMonth: user.ideasGeneratedThisMonth,
        feedbacksThisMonth: user.feedbacksThisMonth,
        emailsThisMonth,
        nutritionThisMonth,
        ideaStructuresThisMonth,
        chatMessagesThisMonth,
        calendarEntriesThisMonth,
      },
      latestGenerations: {
        ideas: recentIdeas,
        feedbacks: recentFeedbacks,
        emails: recentEmails,
        nutritionPlans: recentNutritionPlans,
        ideaStructures: recentIdeaStructures,
        chatMessages: recentChatMessages,
        calendarEntries: recentCalendarEntries,
      },
      historyLimit,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to load user profile' });
  }
}

export async function getBillingSummary(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [paidUsers, trialUsers, expiredUsers] = await Promise.all([
      prisma.user.count({
        where: {
          plan: {
            in: paidPlans,
          },
          planExpiresAt: {
            gt: now,
          },
        },
      }),
      prisma.user.count({
        where: {
          plan: 'FREE_TRIAL',
          trialEndsAt: {
            gt: now,
          },
        },
      }),
      prisma.user.count({
        where: {
          OR: [
            {
              plan: {
                in: paidPlans,
              },
              planExpiresAt: {
                lte: now,
              },
            },
            {
              plan: 'FREE_TRIAL',
              trialEndsAt: {
                lte: now,
              },
            },
          ],
        },
      }),
    ]);

    const baseSummary = {
      paidUsers,
      trialUsers,
      expiredUsers,
      stripeConnected: !!stripe,
    };

    if (!stripe) {
      res.json({
        summary: baseSummary,
        stripe: {
          recentInvoices: [],
          recentEvents: [],
          note: 'Stripe key not configured on server',
        },
      });
      return;
    }

    const [invoices, events] = await Promise.all([
      stripe.invoices.list({ limit: 10, created: { gte: Math.floor(startOfMonth.getTime() / 1000) } }),
      stripe.events.list({ limit: 10 }),
    ]);

    const recentInvoices = invoices.data.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      created: invoice.created,
    }));

    const recentEvents = events.data.map((event) => ({
      id: event.id,
      type: event.type,
      created: event.created,
    }));

    res.json({
      summary: baseSummary,
      stripe: {
        recentInvoices,
        recentEvents,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load billing summary' });
  }
}

export default {
  getOverview,
  listUsers,
  updateUser,
  getUserProfile,
  getBillingSummary,
};
