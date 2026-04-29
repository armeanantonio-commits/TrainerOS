import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  preferredLanguage?: 'ro' | 'en';
  niche?: string | null;
  icpProfile?: unknown;
  positioningMessage?: string | null;
  contentPreferences?: any;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<string>;
  logout: () => Promise<void>;
  updateProfile: (data: { email?: string; name?: string; preferredLanguage?: 'ro' | 'en' }) => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async (): Promise<User | null> => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return null;
    }

    try {
      const { data } = await authAPI.me();
      setUser(data.user);
      return data.user;
    } catch (error) {
      await AsyncStorage.removeItem('token');
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const { data } = await authAPI.login({ email, password });
      if (data.accessToken) {
        await AsyncStorage.setItem('token', data.accessToken);
        setUser(data.user);
      } else {
        throw new Error('Invalid login response');
      }
    } catch (error: any) {
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string): Promise<string> => {
    try {
      const { data } = await authAPI.register({ email, password, name });
      if (data.accessToken) {
        await AsyncStorage.setItem('token', data.accessToken);
        setUser(data.user);
        return data.message || 'Account created successfully.';
      }

      // Registration can succeed without auto-login when email activation is required.
      return data.message || 'Registration successful. Please check your email to activate your account.';
    } catch (error: any) {
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setUser(null);
  };

  const updateProfile = async (data: { email?: string; name?: string; preferredLanguage?: 'ro' | 'en' }) => {
    const response = await authAPI.updateProfile(data);
    if (response.data?.user) {
      setUser(response.data.user);
    } else {
      await checkAuth();
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateProfile, refreshUser: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
