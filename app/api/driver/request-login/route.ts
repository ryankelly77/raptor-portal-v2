import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validatePhone, isNonEmptyString } from '@/lib/validators';
import { getAdminClient } from '@/lib/supabase/admin';

// Rate limiting
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 3; // 3 SMS requests per minute per IP

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
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: MAX_REQUESTS - record.count };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

// Generate a 6-digit numeric code
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests. Please try again later.',
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

  // Environment validation
  const HIGHLEVEL_API_KEY = process.env.HIGHLEVEL_API_KEY;
  const HIGHLEVEL_LOCATION_ID = process.env.HIGHLEVEL_LOCATION_ID;

  if (!HIGHLEVEL_API_KEY || !HIGHLEVEL_LOCATION_ID) {
    console.error('HighLevel credentials not configured');
    return NextResponse.json({ error: 'SMS service not configured' }, { status: 500 });
  }

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { phone } = body;

  if (!isNonEmptyString(phone)) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  const formattedPhone = validatePhone(phone);
  if (!formattedPhone) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Look up driver by phone number
    const digits = phone.replace(/\D/g, '');
    const phoneFormats = [formattedPhone, digits, `+1${digits}`, `1${digits}`];

    let driver = null;
    for (const phoneFormat of phoneFormats) {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, name, phone, is_active')
        .eq('phone', phoneFormat)
        .single();

      if (!error && data) {
        driver = data;
        break;
      }
    }

    if (!driver) {
      // Don't reveal whether phone exists - just say code sent
      // But actually don't send anything for security
      console.log(`[Driver Login] Phone not found: ${formattedPhone.slice(-4)}`);
      return NextResponse.json({ success: true, message: 'If this phone is registered, a code has been sent.' });
    }

    if (!driver.is_active) {
      console.log(`[Driver Login] Inactive driver attempted login: ${driver.name}`);
      return NextResponse.json({ success: true, message: 'If this phone is registered, a code has been sent.' });
    }

    // Generate login code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing unused codes for this driver
    await supabase
      .from('driver_login_tokens')
      .delete()
      .eq('driver_id', driver.id)
      .is('used_at', null);

    // Insert new code
    const { error: insertError } = await supabase
      .from('driver_login_tokens')
      .insert({
        driver_id: driver.id,
        token: code,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Failed to store login code:', insertError);
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }

    // Send SMS via HighLevel
    const headers = {
      'Authorization': `Bearer ${HIGHLEVEL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };

    // Look up or create contact
    let contactId: string | undefined;

    for (const phoneFormat of phoneFormats) {
      const lookupResponse = await fetch(
        `https://services.leadconnectorhq.com/contacts/lookup?locationId=${HIGHLEVEL_LOCATION_ID}&phone=${encodeURIComponent(phoneFormat)}`,
        { headers }
      );

      if (lookupResponse.ok) {
        const lookupResult = await lookupResponse.json();
        if (lookupResult.contact?.id) {
          contactId = lookupResult.contact.id;
          break;
        }
      }
    }

    if (!contactId) {
      const createResponse = await fetch(
        'https://services.leadconnectorhq.com/contacts/',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: formattedPhone,
            locationId: HIGHLEVEL_LOCATION_ID,
            name: driver.name || 'Driver',
          }),
        }
      );
      const createResult = await createResponse.json();

      if (!createResponse.ok) {
        console.error('Create contact error:', createResult);
        // Continue anyway - we'll return success but the driver won't get SMS
      } else {
        contactId = createResult.contact?.id;
      }
    }

    if (contactId) {
      const message = `Your Raptor Vending login code is: ${code}\n\nThis code expires in 10 minutes.`;

      const smsResponse = await fetch(
        'https://services.leadconnectorhq.com/conversations/messages',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'SMS',
            contactId: contactId,
            message: message,
          }),
        }
      );

      if (!smsResponse.ok) {
        const smsResult = await smsResponse.json();
        console.error('SMS error:', smsResult);
        // Don't fail the request - the code is stored and they could potentially call support
      } else {
        console.log(`[Driver Login] Code sent to ${driver.name}`);
      }
    }

    return NextResponse.json({ success: true, message: 'If this phone is registered, a code has been sent.' });
  } catch (error) {
    console.error('Request login code error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
  }
}
