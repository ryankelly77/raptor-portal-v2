'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface AdminInfo {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
}

interface AdminAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  adminInfo: AdminInfo | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);

  // Check session storage on mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem('adminAuth');
    const token = sessionStorage.getItem('adminToken');
    const storedAdminInfo = sessionStorage.getItem('adminInfo');
    if (authStatus === 'true' && token) {
      setIsAuthenticated(true);
      if (storedAdminInfo) {
        try {
          setAdminInfo(JSON.parse(storedAdminInfo));
        } catch {
          // Ignore parse errors
        }
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('adminToken', result.token);
        if (result.admin) {
          sessionStorage.setItem('adminInfo', JSON.stringify(result.admin));
          setAdminInfo(result.admin);
        }
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Invalid credentials' };
      }
    } catch {
      return { success: false, error: 'Authentication failed' };
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('adminAuth');
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminInfo');
    setIsAuthenticated(false);
    setAdminInfo(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, adminInfo, login, logout }}>
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
