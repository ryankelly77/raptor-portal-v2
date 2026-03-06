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

// Store challenge in database
export async function storeChallenge(userId: string, challenge: string) {
  const supabase = getAdminClient();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

  // Upsert challenge (replace if exists)
  await supabase
    .from('webauthn_challenges')
    .upsert({
      user_id: userId,
      challenge,
      expires_at: expiresAt,
    }, {
      onConflict: 'user_id',
    });
}

// Get and remove challenge from database
export async function getAndRemoveChallenge(userId: string): Promise<string | null> {
  const supabase = getAdminClient();

  // Get the challenge
  const { data, error } = await supabase
    .from('webauthn_challenges')
    .select('challenge, expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.log('[WebAuthn] Challenge not found for user:', userId);
    return null;
  }

  // Delete the challenge (one-time use)
  await supabase
    .from('webauthn_challenges')
    .delete()
    .eq('user_id', userId);

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    console.log('[WebAuthn] Challenge expired for user:', userId);
    return null;
  }

  return data.challenge;
}

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
