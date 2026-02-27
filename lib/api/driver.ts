// Client-side Driver API client
// Use in Client Components only ('use client')

import type { TempLogSession, TempLogEntry } from '@/types/database';

const API_BASE = '/api';

// Token storage keys
const TOKEN_KEY = 'driver_token';
const DRIVER_KEY = 'driver_info';

export interface DriverInfo {
  id: string;
  name: string;
}

export interface SessionWithEntries extends TempLogSession {
  entries: TempLogEntry[];
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredDriver(): DriverInfo | null {
  if (typeof window === 'undefined') return null;
  const info = sessionStorage.getItem(DRIVER_KEY);
  return info ? JSON.parse(info) : null;
}

export function clearDriverSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(DRIVER_KEY);
}

function storeSession(token: string, driver: DriverInfo): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
}

// Helper for authenticated requests
async function driverFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle expired token
    if (response.status === 401) {
      clearDriverSession();
      throw new Error('SESSION_EXPIRED');
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// ============================================
// AUTHENTICATION
// ============================================

export async function authenticateDriver(accessToken: string): Promise<DriverInfo> {
  const response = await fetch(`${API_BASE}/driver/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Authentication failed');
  }

  storeSession(data.token, data.driver);
  return data.driver;
}

// ============================================
// SESSION OPERATIONS
// ============================================

export async function getActiveSession(): Promise<SessionWithEntries | null> {
  const data = await driverFetch<{ session: SessionWithEntries | null }>('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({ action: 'getActiveSession' }),
  });
  return data.session;
}

export async function createSession(vehicleId: string | null = null, notes: string | null = null): Promise<TempLogSession> {
  const data = await driverFetch<{ session: TempLogSession }>('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({
      action: 'createSession',
      data: { vehicleId, notes },
    }),
  });
  return data.session;
}

export async function completeSession(sessionId: string): Promise<TempLogSession> {
  const data = await driverFetch<{ session: TempLogSession }>('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({
      action: 'completeSession',
      id: sessionId,
    }),
  });
  return data.session;
}

export async function getSessionHistory(): Promise<TempLogSession[]> {
  const data = await driverFetch<{ sessions: TempLogSession[] }>('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({ action: 'getSessionHistory' }),
  });
  return data.sessions;
}

// ============================================
// ENTRY OPERATIONS
// ============================================

export interface AddEntryParams {
  sessionId: string;
  entryType: 'pickup' | 'delivery';
  temperature: number;
  locationName?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
}

export async function addEntry(params: AddEntryParams): Promise<TempLogEntry> {
  const { sessionId, entryType, temperature, locationName = null, photoUrl = null, notes = null } = params;
  const data = await driverFetch<{ entry: TempLogEntry }>('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({
      action: 'addEntry',
      data: { sessionId, entryType, temperature, locationName, photoUrl, notes },
    }),
  });
  return data.entry;
}

export interface UpdateEntryParams {
  temperature?: number;
  photoUrl?: string;
  notes?: string;
  locationName?: string;
}

export async function updateEntry(entryId: string, updates: UpdateEntryParams): Promise<TempLogEntry> {
  const data = await driverFetch<{ entry: TempLogEntry }>('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateEntry',
      data: { entryId, ...updates },
    }),
  });
  return data.entry;
}

export async function deleteEntry(entryId: string): Promise<void> {
  await driverFetch('/driver/temp-log', {
    method: 'POST',
    body: JSON.stringify({
      action: 'deleteEntry',
      data: { entryId },
    }),
  });
}

// ============================================
// PHOTO UPLOAD
// ============================================

export async function uploadPhoto(file: File, sessionId: string, entryId: string): Promise<string> {
  const driver = getStoredDriver();
  if (!driver) throw new Error('No driver session');

  // Import the browser supabase client dynamically
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();

  const fileName = `${driver.id}/${sessionId}/${entryId}_${Date.now()}.jpg`;

  console.log('[Photo Upload] Uploading to:', fileName);

  const { data, error } = await supabase.storage
    .from('temp-logs')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('[Photo Upload] Error:', error);
    throw error;
  }

  console.log('[Photo Upload] Success:', data);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('temp-logs')
    .getPublicUrl(fileName);

  console.log('[Photo Upload] Public URL:', urlData.publicUrl);

  return urlData.publicUrl;
}
