import { NextRequest, NextResponse } from 'next/server';
import { createDriverToken } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';

interface DriverAuthRequest {
  accessToken?: string;
}

export async function POST(request: NextRequest) {
  let body: DriverAuthRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accessToken } = body;

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
  }

  // Clean the token (remove whitespace, normalize)
  const cleanToken = accessToken.trim().toLowerCase();

  if (cleanToken.length < 8 || cleanToken.length > 32) {
    return NextResponse.json({ error: 'Invalid token format' }, { status: 400 });
  }

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Look up driver by access token
    const { data: driver, error } = await supabase
      .from('drivers')
      .select('id, name, email, phone, is_active')
      .eq('access_token', cleanToken)
      .single();

    if (error || !driver) {
      console.log(`[Driver Auth] Invalid token attempt: ${cleanToken.substring(0, 4)}...`);
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    if (!driver.is_active) {
      console.log(`[Driver Auth] Inactive driver attempted login: ${driver.name}`);
      return NextResponse.json({ error: 'Driver account is inactive' }, { status: 401 });
    }

    // Generate JWT
    const token = createDriverToken(driver.id, driver.email);

    console.log(`[Driver Auth] Successful login: ${driver.name}`);

    return NextResponse.json({
      token,
      driver: {
        id: driver.id,
        name: driver.name,
      },
    });
  } catch (error) {
    console.error('Driver auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
