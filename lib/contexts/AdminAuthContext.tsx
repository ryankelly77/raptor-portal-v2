'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface AdminAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check session storage on mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem('adminAuth');
    const token = sessionStorage.getItem('adminToken');
    if (authStatus === 'true' && token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('[AUTH CONTEXT] Login success, token received:', result.token?.substring(0, 30) + '...');
        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('adminToken', result.token);
        console.log('[AUTH CONTEXT] Token saved to sessionStorage');
        setIsAuthenticated(true);
        return { success: true };
      } else {
        console.log('[AUTH CONTEXT] Login failed:', result.error);
        return { success: false, error: result.error || 'Invalid password' };
      }
    } catch {
      return { success: false, error: 'Authentication failed' };
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('adminAuth');
    sessionStorage.removeItem('adminToken');
    setIsAuthenticated(false);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
