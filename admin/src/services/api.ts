import axios, { AxiosError } from 'axios';
import type {
  AdminBillingResponse,
  AdminOverviewResponse,
  AdminUserProfileResponse,
  AdminUsersResponse,
  AuthUser,
  Plan,
} from '../types';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://api.traineros.org/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', { email, password });
  return response.data;
}

export async function me(): Promise<AuthUser> {
  const response = await api.get<{ user: AuthUser }>('/auth/me');
  return response.data.user;
}

export async function getOverview(): Promise<AdminOverviewResponse> {
  const response = await api.get<AdminOverviewResponse>('/admin/overview');
  return response.data;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  plan?: Plan | '';
  status?: 'active' | 'trial' | 'expired' | '';
}

export async function getUsers(params: ListUsersParams): Promise<AdminUsersResponse> {
  const response = await api.get<AdminUsersResponse>('/admin/users', { params });
  return response.data;
}

export async function updateUser(
  userId: string,
  payload: { plan?: Plan; isAdmin?: boolean; isEmailVerified?: boolean; planExpiresAt?: string | null }
): Promise<void> {
  await api.patch(`/admin/users/${userId}`, payload);
}

export async function getBilling(): Promise<AdminBillingResponse> {
  const response = await api.get<AdminBillingResponse>('/admin/billing');
  return response.data;
}

export async function getUserProfile(userId: string, historyLimit = 25): Promise<AdminUserProfileResponse> {
  const response = await api.get<AdminUserProfileResponse>(`/admin/users/${userId}/profile`, {
    params: { historyLimit },
  });
  return response.data;
}

export function parseApiError(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}

export default api;
