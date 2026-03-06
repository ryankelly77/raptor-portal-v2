// WebAuthn configuration and helpers
import { getAdminClient } from '@/lib/supabase/admin';

// RP (Relying Party) configuration
export const rpName = 'Raptor Vending Portal';
export const rpID = process.env.NODE_ENV === 'production'
  ? 'portal.raptor-vending.com'
  : 'localhost';
export const origin = process.env.NODE_ENV === 'production'
  ? 'https://portal.raptor-vending.com'
  : 'http://localhost:3000';

// Challenge storage (in production, use Redis or database)
// For simplicity, we'll use a Map with expiration
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

export function storeChallenge(userId: string, challenge: string) {
  // Expire in 5 minutes
  challenges.set(userId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export function getAndRemoveChallenge(userId: string): string | null {
  const stored = challenges.get(userId);
  if (!stored) return null;

  challenges.delete(userId);

  if (Date.now() > stored.expiresAt) {
    return null;
  }

  return stored.challenge;
}

// Cleanup expired challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of challenges.entries()) {
    if (now > value.expiresAt) {
      challenges.delete(key);
    }
  }
}, 60 * 1000);

// Helper to get user credentials from database
export async function getUserCredentials(userId: string, userType: 'admin' | 'driver') {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select('*')
    .eq('user_id', userId)
    .eq('user_type', userType);

  if (error) {
    console.error('Error fetching WebAuthn credentials:', error);
    return [];
  }

  return data || [];
}

// Helper to find user by email
export async function findAdminByEmail(email: string) {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('is_active', true)
    .single();

  if (error) {
    return null;
  }

  return data;
}

// Helper to find driver by email or phone
export async function findDriverByEmailOrPhone(identifier: string) {
  const supabase = getAdminClient();

  // Try email first
  let { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('email', identifier.toLowerCase())
    .eq('is_active', true)
    .single();

  if (!data && !error?.message?.includes('multiple')) {
    // Try phone
    const phone = identifier.replace(/\D/g, '');
    const result = await supabase
      .from('drivers')
      .select('*')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    data = result.data;
  }

  return data;
}
