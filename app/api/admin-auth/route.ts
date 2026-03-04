import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { isNonEmptyString } from '@/lib/validators';
import { createAdminToken } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';
import type { Admin } from '@/types/database';

// Rate limiting store
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_ATTEMPTS = 5; // 5 attempts per minute per IP

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  // Cleanup old entries (simple garbage collection)
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
        error: 'Too many login attempts. Please try again later.',
        retryAfter: rateLimit.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Environment validation
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    console.error('ADMIN_PASSWORD or JWT_SECRET not configured');
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  // Input validation
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password } = body;
  if (!isNonEmptyString(password)) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  // Prevent overly long passwords (DoS protection)
  if (password.length > 256) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
  }

  // If email is provided, authenticate against the admins table
  if (email && isNonEmptyString(email)) {
    try {
      const supabase = getAdminClient();

      // Look up admin by email
      const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single();

      if (error || !admin) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const typedAdmin = admin as Admin;

      // Verify password with bcrypt
      const isValidPassword = await bcrypt.compare(password, typedAdmin.password_hash);
      if (!isValidPassword) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      // Update last_login timestamp
      await supabase
        .from('admins')
        .update({ last_login: new Date().toISOString() })
        .eq('id', typedAdmin.id);

      // Generate token with admin details
      const token = createAdminToken({
        adminId: typedAdmin.id,
        email: typedAdmin.email,
        name: typedAdmin.name,
        role: typedAdmin.role,
      });

      return NextResponse.json(
        {
          success: true,
          token,
          expiresIn: '8h',
          admin: {
            id: typedAdmin.id,
            email: typedAdmin.email,
            name: typedAdmin.name,
            role: typedAdmin.role,
          },
        },
        {
          headers: {
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    } catch (err) {
      console.error('Database auth error:', err);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
  }

  // Legacy: password-only authentication using environment variable
  // Constant-time comparison to prevent timing attacks
  const passwordBuffer = Buffer.from(password);
  const adminPasswordBuffer = Buffer.from(ADMIN_PASSWORD);

  const isValidPassword =
    passwordBuffer.length === adminPasswordBuffer.length &&
    crypto.timingSafeEqual(passwordBuffer, adminPasswordBuffer);

  if (isValidPassword) {
    try {
      console.log('[AUTH] JWT_SECRET available:', !!process.env.JWT_SECRET, 'length:', process.env.JWT_SECRET?.length);
      const token = createAdminToken();

      return NextResponse.json(
        {
          success: true,
          token,
          expiresIn: '8h',
        },
        {
          headers: {
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    } catch (err) {
      console.error('Token generation error:', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
    }
  }

  // Invalid password - don't reveal whether password exists
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
