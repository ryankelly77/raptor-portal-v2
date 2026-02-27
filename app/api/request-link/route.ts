import { NextRequest, NextResponse } from 'next/server';
import { validatePhone, isValidUrl, isNonEmptyString } from '@/lib/validators';

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

interface RequestLinkBody {
  phone: string;
  projectUrl: string;
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

  let body: RequestLinkBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { phone, projectUrl } = body;

  // Input validation
  if (!isNonEmptyString(phone)) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  if (!isNonEmptyString(projectUrl)) {
    return NextResponse.json({ error: 'Project URL is required' }, { status: 400 });
  }

  const formattedPhone = validatePhone(phone);
  if (!formattedPhone) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  // Validate URL is from our domain (security check)
  if (!isValidUrl(projectUrl)) {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  try {
    const url = new URL(projectUrl);
    const allowedHosts = ['portal.raptor-vending.com', 'localhost'];
    if (!allowedHosts.some(host => url.hostname.includes(host))) {
      return NextResponse.json({ error: 'Invalid project URL' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  const digits = phone.replace(/\D/g, '');
  const headers = {
    'Authorization': `Bearer ${HIGHLEVEL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    let contactId: string | undefined;

    // Try to find existing contact
    const phoneFormats = [formattedPhone, digits, `1${digits}`];

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

    // Create contact if not found
    if (!contactId) {
      const createResponse = await fetch(
        'https://services.leadconnectorhq.com/contacts/',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: formattedPhone,
            locationId: HIGHLEVEL_LOCATION_ID,
            name: 'Portal Visitor',
          }),
        }
      );
      const createResult = await createResponse.json();

      if (!createResponse.ok) {
        console.error('Create contact error:', createResult);
        throw new Error('Failed to create contact');
      }
      contactId = createResult.contact?.id;
    }

    if (!contactId) {
      throw new Error('Could not find or create contact');
    }

    // Send SMS with hardcoded template
    const message = `View your Raptor Vending installation progress on your phone: ${projectUrl}`;

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

    const smsResult = await smsResponse.json();

    if (!smsResponse.ok) {
      console.error('SMS error:', smsResult);
      throw new Error('Failed to send SMS');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Request project link error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
