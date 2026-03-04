import { NextRequest, NextResponse } from 'next/server';
import { validatePhone, isNonEmptyString } from '@/lib/validators';
import { createDriverToken } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';

// Rate limiting
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5; // 5 verify attempts per minute per IP

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (rateLimitStore.size > 1000) {
    for (const [key, val] of rateLimitStore.entries()) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }

  if (!record || now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  record.count++;
  if (record.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.count };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Too many attempts. Please try again later.',
        retryAfter: rateLimit.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter),
        },
      }
    );
  }

  let body: { phone?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { phone, code } = body;

  if (!isNonEmptyString(phone)) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  if (!isNonEmptyString(code)) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  const formattedPhone = validatePhone(phone);
  if (!formattedPhone) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  // Clean the code (remove spaces, dashes)
  const cleanCode = code.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
  }

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Look up driver by phone
    const digits = phone.replace(/\D/g, '');
    const phoneFormats = [formattedPhone, digits, `+1${digits}`, `1${digits}`];

    let driver = null;
    for (const phoneFormat of phoneFormats) {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, name, email, phone, is_active')
        .eq('phone', phoneFormat)
        .single();

      if (!error && data) {
        driver = data;
        break;
      }
    }

    if (!driver) {
      return NextResponse.json({ error: 'Invalid code or phone number' }, { status: 401 });
    }

    if (!driver.is_active) {
      return NextResponse.json({ error: 'Driver account is inactive' }, { status: 401 });
    }

    // Look up the login token
    const { data: loginToken, error: tokenError } = await supabase
      .from('driver_login_tokens')
      .select('*')
      .eq('driver_id', driver.id)
      .eq('token', cleanCode)
      .is('used_at', null)
      .single();

    if (tokenError || !loginToken) {
      console.log(`[Driver Verify] Invalid code attempt for ${driver.name}`);
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
    }

    // Check if expired
    if (new Date(loginToken.expires_at) < new Date()) {
      console.log(`[Driver Verify] Expired code attempt for ${driver.name}`);
      return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 401 });
    }

    // Mark code as used
    await supabase
      .from('driver_login_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', loginToken.id);

    // Generate JWT
    const token = createDriverToken(driver.id, driver.email || '');

    console.log(`[Driver Verify] Successful login: ${driver.name}`);

    return NextResponse.json({
      token,
      driver: {
        id: driver.id,
        name: driver.name,
      },
    });
  } catch (error) {
    console.error('Verify code error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
