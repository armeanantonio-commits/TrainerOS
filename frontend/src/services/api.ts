import axios from 'axios';

function normalizeApiBaseUrl(rawUrl?: string): string {
  const trimmed = rawUrl?.trim();

  if (!trimmed) {
    return '/api';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/api')
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api`;
}

const apiBaseUrl = import.meta.env.DEV
  ? '/api'
  : normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

export function buildApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${apiBaseUrl}${normalizedPath}`;
}

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔑 Token sent:', token.substring(0, 20) + '...');
    } else {
      console.warn('⚠️ No token found in localStorage');
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
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
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
};

// Niche API
export const nicheAPI = {
  generateQuick: (data: { query: string; saveToProfile?: boolean }) =>
    api.post('/niche/generate/quick', { quickNiche: data.query, saveToProfile: data.saveToProfile }),
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
    gender: 'femei' | 'barbati' | 'ambele' | string;
    ageRanges: string[];
    valueSituations: string[];
    commonProblems: string[];
    primaryOutcome: string;
    avoidContent?: string[];
  }) => api.post('/niche/generate/variants', data),
  generatePresetOptions: () => api.post('/niche/generate/preset-options'),
  savePresetSelection: (data: { niche: string; description?: string }) =>
    api.post('/niche/preset-selection', data),
  generateDiscover: (data: {
    gender: 'femei' | 'barbati' | 'ambele' | string;
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
};

// Idea API
export const ideaAPI = {
  generate: (data?: { nicheId?: string }) =>
    api.post('/idea/generate', data || {}),
  generateMultiFormat: (data?: { general?: boolean }) => api.post('/idea/generate/multi-format', data || {}),
  structure: (data: { ideaText: string }) => api.post('/idea/structure', data),
  history: () => api.get('/idea/history'),
};

// Feedback API
export const feedbackAPI = {
  analyze: (formData: FormData) =>
    api.post('/feedback/analyze', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
  analyzeText: (data: { text: string; format: string }) =>
    api.post('/feedback/analyze-text', data),
};

// Email Marketing API
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

// Nutrition API
export const nutritionAPI = {
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
    macroDistributionType: 'equal' | 'around-workout' | 'more-evening-carbs' | 'low-carb-breakfast' | 'custom';
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
    planStyle: 'exact-grams' | 'macros-plus-examples' | 'flexible-template' | 'full-day-with-alternatives';
  }) => api.post('/nutrition/report', data),
};
