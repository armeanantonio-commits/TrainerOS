import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '@/services/api';
import { initMetaPixel, trackMetaCompleteRegistration } from '@/lib/metaPixel';

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
  logout: () => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void checkAuth();
  }, []);

  const checkAuth = async (): Promise<User | null> => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return null;
    }

    try {
      const { data } = await authAPI.me();
      setUser(data.user);
      return data.user;
    } catch (error) {
      localStorage.removeItem('token');
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const { data } = await authAPI.login({ email, password });
      console.log('✅ Login response:', data);
      if (data.accessToken) {
        localStorage.setItem('token', data.accessToken);
        setUser(data.user);
        console.log('🔑 Token saved to localStorage');
      } else {
        console.error('❌ No accessToken in response:', data);
        throw new Error('Invalid login response');
      }
    } catch (error: any) {
      console.error('❌ Login error:', error.response?.data || error.message);
      throw error; // Re-throw to let the component handle it
    }
  };

  const register = async (email: string, password: string, name: string): Promise<string> => {
    try {
      const { data } = await authAPI.register({ email, password, name });
      console.log('✅ Register response:', data);
      initMetaPixel();
      trackMetaCompleteRegistration();
      return data.message || 'Registration successful. Check your email to activate your account.';
    } catch (error: any) {
      console.error('❌ Register error:', error.response?.data || error.message);
      throw error; // Re-throw to let the component handle it
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser: checkAuth }}>
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
