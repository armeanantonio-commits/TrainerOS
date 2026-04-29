import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://api.traineros.org/api';

const api = axios.create({
  baseURL: API_URL,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('token');
      // Navigation will be handled by the auth context
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  activateAccount: (data: { token: string }) =>
    api.post('/auth/activate-account', data),
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),
  resetPassword: (data: { token: string; password: string }) =>
    api.post('/auth/reset-password', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { email?: string; name?: string; preferredLanguage?: 'ro' | 'en' }) =>
    api.put('/auth/profile', data),
};

// Niche API
export const nicheAPI = {
  generateQuick: (data: { query: string; saveToProfile?: boolean }) =>
    api.post('/niche/generate/quick', {
      quickNiche: data.query,
      saveToProfile: data.saveToProfile,
    }),
  generateQuickICP: (data: {
    gender: 'femei' | 'barbati' | 'ambele';
    ageRanges: string[];
    customAgeRange?: string;
    wakeUpTime?: string;
    jobType?: 'sedentar' | 'activ' | 'mixt';
    sittingTime?: '<4h' | '4-6h' | '6-8h' | '8h+';
    morning?: string[];
    lunch?: string[];
    evening?: string[];
    definingSituations?: string[];
    kidsImpact?: string[];
    activeStatus?: string[];
    physicalJobIssue?: string[];
    painDetails?: string[];
    lifestyleSpecific?: string;
    mainReasons?: string[];
    primaryReason?: string;
    whatDoesntWork?: string[];
    otherDoesntWork?: string;
    emotionalBlock?: string;
    emotionalBlockCustom?: string;
    whatTheyDontWant?: string[];
    otherDontWant?: string;
    sportRelationship?: string;
    sportRelationshipSpecific?: string;
    desiredFeelings?: string[];
    differentiation?: string;
    internalObjections?: string[];
    saveToProfile?: boolean;
  }) => api.post('/niche/generate/quick-icp', data),
  generateWizard: (data: {
    targetAudience: string;
    problemSolved: string;
    results: string;
    clientType: string;
    uniquePosition: string;
    saveToProfile?: boolean;
  }) => api.post('/niche/generate/wizard', {
    q1: data.targetAudience,
    q2: data.problemSolved,
    q3: data.results,
    q4: data.clientType,
    q5: data.uniquePosition,
    saveToProfile: data.saveToProfile,
  }),
  generateVariants: (data: {
    gender: 'femei' | 'barbati' | 'ambele';
    ageRanges: string[];
    valueSituations: string[];
    commonProblems: string[];
    primaryOutcome: string;
    avoidContent?: string[];
  }) => api.post('/niche/generate/variants', data),
  generateDiscover: (data: {
    gender: 'femei' | 'barbati' | 'ambele';
    ageRanges: string[];
    valueSituations: string[];
    commonProblems: string[];
    primaryOutcome: string;
    avoidContent?: string[];
    selectedNiche: string;
    awarenessLevel?: string;
    identityStory?: string;
    clientStatement: string;
    dominantGoals: string[];
    primaryGoal: string;
    wakeUpTime?: string;
    jobType?: 'sedentar' | 'activ' | 'mixt';
    sittingTime?: '<4h' | '4-6h' | '6-8h' | '8h+';
    morning?: string[];
    lunch?: string[];
    evening?: string[];
    definingSituations?: string[];
    notes?: string;
    saveToProfile?: boolean;
  }) => api.post('/niche/generate/discover', data),
  generateICPDay: (data: {
    niche: string;
    age?: string;
    gender?: string;
    occupation?: string;
    pains?: string[];
    goals?: string[];
    objections?: string[];
    dreamOutcome?: string;
  }) => api.post('/niche/generate/icp-day', data),
  reset: () => api.post('/niche/reset'),
};

// Idea API
export const ideaAPI = {
  generate: (data?: { nicheId?: string; objective?: 'lead-gen' | 'engagement' | 'education' }) =>
    api.post('/idea/generate', data || {}),
  generateMultiFormat: () => api.post('/idea/generate/multi-format'),
  structure: (data: { ideaText: string }) => api.post('/idea/structure', data),
  history: (params?: { page?: number; limit?: number }) =>
    api.get('/idea/history', { params }),
  get: (id: string) => api.get(`/idea/${id}`),
};

// Feedback API
export const feedbackAPI = {
  analyze: async (data: {
    uri: string;
    type: string;
    name: string;
    format: string;
  }) => {
    const token = await AsyncStorage.getItem('token');
    return new Promise<{ data: any }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/feedback/analyze`);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.onload = () => {
        let parsed: any = {};
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          parsed = { error: xhr.responseText || 'Upload failed' };
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ data: parsed });
        } else {
          const error: any = new Error(parsed?.error || 'Failed to analyze video');
          error.response = { status: xhr.status, data: parsed };
          reject(error);
        }
      };

      xhr.onerror = () => {
        const error: any = new Error('Network error while uploading file');
        error.response = { status: 0, data: { error: 'Network error' } };
        reject(error);
      };

      const formData = new FormData();
      formData.append('file', {
        uri: data.uri,
        type: data.type,
        name: data.name,
      } as any);
      formData.append('format', data.format);

      xhr.send(formData);
    });
  },
  analyzeText: (data: { text: string; format: string }) =>
    api.post('/feedback/analyze-text', data),
  history: () => api.get('/feedback/history'),
  get: (id: string) => api.get(`/feedback/${id}`),
};

// Stats API
export const statsAPI = {
  dashboard: () => api.get('/stats/dashboard'),
};

export const subscriptionAPI = {
  status: () => api.get('/subscription/status'),
  createCheckoutSession: (data: {
    billingCycle: 'monthly' | 'yearly';
    plan?: 'PRO' | 'MAX';
    promoCode?: string;
    successUrl?: string;
    cancelUrl?: string;
  }) => api.post('/subscription/create-checkout-session', data),
  verifyApplePurchase: (data: {
    productId: string;
    purchaseToken: string;
    transactionId: string;
    originalTransactionId?: string;
    environment?: string;
    transactionDate?: number;
  }) =>
    postSubscriptionApple(
      ['/subscription/apple/verify', '/subscription/ios/verify', '/subscription/verify-apple'],
      data
    ),
  restoreApplePurchases: (data: {
    purchases: Array<{
      productId: string;
      purchaseToken: string;
      transactionId: string;
      originalTransactionId?: string;
      environment?: string;
      transactionDate?: number;
    }>;
  }) =>
    postSubscriptionApple(
      ['/subscription/apple/restore', '/subscription/ios/restore', '/subscription/restore-apple'],
      data
    ),
};

async function postSubscriptionApple(pathCandidates: string[], payload: any) {
  let lastError: any = null;

  for (const path of pathCandidates) {
    try {
      return await api.post(path, payload);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 || status === 405) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Subscription endpoint not found.');
}

// Content Preferences API
export const contentAPI = {
  savePreferences: (data: any) => api.post('/niche/content-preferences', data),
  getPreferences: () => api.get('/niche/content-preferences'),
};

export const chatAPI = {
  stream: (data: {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) =>
    api.post('/chat/stream', data, {
      responseType: 'text',
      headers: {
        'Content-Type': 'application/json',
      },
      transformResponse: [(value) => value],
    }),
};

export const emailAPI = {
  generate: (data: {
    topic: string;
    objective: 'lead-magnet' | 'nurture' | 'sales' | 'reengagement';
    emailType: 'single' | 'welcome' | 'promo' | 'newsletter';
    tone: 'direct' | 'empathetic' | 'authoritative' | 'friendly';
    offer?: string;
    audiencePain?: string;
    ctaGoal?: string;
    language: 'ro' | 'en';
  }) => api.post('/email/generate', data),
};

export const nutritionAPI = {
  generatePlan: (data: {
    calories: number;
    proteinGrams: number;
    fatGrams: number;
    carbsGrams: number;
    mealsPerDayType: '3' | '3+1' | '4' | '5' | 'custom';
    customMealsPerDay?: number;
    macroDistributionType:
      | 'equal'
      | 'around-workout'
      | 'more-evening-carbs'
      | 'low-carb-breakfast'
      | 'custom';
    customMacroDistribution?: string;
    wakeUpTime: string;
    sleepTime: string;
    hasTraining: boolean;
    trainingTime?: string;
    workProgram?: 'fixed' | 'shifts' | 'flexible' | 'mostly-home';
    mealLocations: ('home' | 'office' | 'delivery' | 'canteen' | 'on-the-go')[];
    cookingLevel: 'daily' | 'meal-prep' | 'rare' | 'almost-never';
    foodBudget: 'low' | 'medium' | 'high';
    dietaryRestrictions: (
      | 'lactose-free'
      | 'gluten-free'
      | 'vegetarian'
      | 'vegan'
      | 'intermittent-fasting'
      | 'religious-fasting'
      | 'allergies'
    )[];
    allergiesDetails?: string;
    excludedFoodsAndPreferences?: string;
    planStyle:
      | 'exact-grams'
      | 'macros-plus-examples'
      | 'flexible-template'
      | 'full-day-with-alternatives';
  }) => api.post('/nutrition/generate', data),
  generateReport: (data: {
    clientName: string;
    age: number;
    sex: 'male' | 'female' | 'other';
    weightKg: number;
    heightCm: number;
    activityLevel: 'sedentary' | 'lightly-active' | 'moderately-active' | 'very-active' | 'athlete';
    preferredEatingStyle: 'anything' | 'high-protein' | 'vegetarian' | 'vegan' | 'pescatarian' | 'mediterranean';
    objective: 'lose-weight' | 'maintain' | 'gain-muscle' | 'recomposition' | 'performance';
    goalWeightKg?: number;
    targetDate?: string;
    clientNotes?: string;
    calories: number;
    proteinGrams: number;
    fatGrams: number;
    carbsGrams: number;
    mealsPerDayType: '3' | '3+1' | '4' | '5' | 'custom';
    customMealsPerDay?: number;
    macroDistributionType:
      | 'equal'
      | 'around-workout'
      | 'more-evening-carbs'
      | 'low-carb-breakfast'
      | 'custom';
    customMacroDistribution?: string;
    wakeUpTime: string;
    sleepTime: string;
    hasTraining: boolean;
    trainingTime?: string;
    workProgram: 'fixed' | 'shifts' | 'flexible' | 'mostly-home';
    mealLocations: ('home' | 'office' | 'delivery' | 'canteen' | 'on-the-go')[];
    cookingLevel: 'daily' | 'meal-prep' | 'rare' | 'almost-never';
    foodBudget: 'low' | 'medium' | 'high';
    dietaryRestrictions: (
      | 'lactose-free'
      | 'gluten-free'
      | 'vegetarian'
      | 'vegan'
      | 'intermittent-fasting'
      | 'religious-fasting'
      | 'allergies'
    )[];
    allergiesDetails?: string;
    excludedFoodsAndPreferences?: string;
    planStyle:
      | 'exact-grams'
      | 'macros-plus-examples'
      | 'flexible-template'
      | 'full-day-with-alternatives';
  }) => api.post('/nutrition/report', data),
};
