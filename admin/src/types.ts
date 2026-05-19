export type Plan = 'FREE_TRIAL' | 'STARTER' | 'PRO' | 'ELITE' | 'MAX';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  plan: Plan;
}

export interface AdminOverviewResponse {
  metrics: {
    totalUsers: number;
    newUsersLast7Days: number;
    ideasGeneratedThisMonth: number;
    feedbackGeneratedThisMonth: number;
    estimatedMrr: number;
    expiringSubscriptions7Days: number;
  };
  planDistribution: Record<Plan, number>;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  isEmailVerified: boolean;
  isAdmin: boolean;
  plan: Plan;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
  lastIdeaGeneratedAt: string | null;
  lastLoginAt: string | null;
  lastPaymentAt: string | null;
  lastIdea:
    | {
        id: string;
        format: 'REEL' | 'CAROUSEL' | 'STORY';
        hook: string;
        createdAt: string;
      }
    | null;
  ideasGeneratedThisMonth: number;
  feedbacksThisMonth: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminBillingResponse {
  summary: {
    paidUsers: number;
    trialUsers: number;
    expiredUsers: number;
    stripeConnected: boolean;
  };
  stripe: {
    recentInvoices: Array<{
      id: string;
      status: string | null;
      amountPaid: number;
      currency: string;
      customerEmail: string | null;
      created: number;
    }>;
    recentEvents: Array<{
      id: string;
      type: string;
      created: number;
    }>;
    note?: string;
  };
}

export interface AdminUserProfileResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    niche: string | null;
    hasNicheProfile: boolean;
    isEmailVerified: boolean;
    isAdmin: boolean;
    plan: Plan;
    planExpiresAt: string | null;
    trialEndsAt: string | null;
    lastIdeaGeneratedAt: string | null;
    lastLoginAt: string | null;
    lastPaymentAt: string | null;
    ideasGeneratedThisMonth: number;
    feedbacksThisMonth: number;
    createdAt: string;
  };
  usage: {
    ideasTotal: number;
    feedbacksTotal: number;
    emailsTotal: number;
    nutritionTotal: number;
    ideaStructuresTotal: number;
    chatMessagesTotal: number;
    calendarEntriesTotal: number;
    ideasThisMonth: number;
    feedbacksThisMonth: number;
    emailsThisMonth: number;
    nutritionThisMonth: number;
    ideaStructuresThisMonth: number;
    chatMessagesThisMonth: number;
    calendarEntriesThisMonth: number;
  };
  latestGenerations: {
    ideas: Array<{
      id: string;
      format: 'REEL' | 'CAROUSEL' | 'STORY';
      hook: string;
      objective: string;
      createdAt: string;
    }>;
    feedbacks: Array<{
      id: string;
      fileType: string;
      fileName: string;
      overallScore: number;
      summary: string;
      createdAt: string;
    }>;
    emails: Array<{
      id: string;
      topic: string;
      objective: string;
      emailType: string;
      tone: string;
      language: string;
      createdAt: string;
    }>;
    nutritionPlans: Array<{
      id: string;
      calories: number;
      proteinGrams: number;
      fatGrams: number;
      carbsGrams: number;
      mealsPerDay: number;
      createdAt: string;
    }>;
    ideaStructures: Array<{
      id: string;
      ideaText: string;
      createdAt: string;
    }>;
    chatMessages: Array<{
      id: string;
      message: string;
      createdAt: string;
    }>;
    calendarEntries: Array<{
      id: string;
      title: string;
      format: 'REEL' | 'CAROUSEL' | 'STORY';
      status: 'PLANNED' | 'POSTED' | 'SKIPPED';
      date: string;
      createdAt: string;
    }>;
  };
  historyLimit: number;
}
