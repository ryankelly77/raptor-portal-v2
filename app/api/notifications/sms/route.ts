import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { validatePhone, isValidUrl, isNonEmptyString } from '@/lib/validators';

interface SmsRequest {
  phone: string;
  url: string;
}

export async function POST(request: NextRequest) {
  // Admin authentication
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  // Environment validation
  const HIGHLEVEL_API_KEY = process.env.HIGHLEVEL_API_KEY;
  const HIGHLEVEL_LOCATION_ID = process.env.HIGHLEVEL_LOCATION_ID;

  if (!HIGHLEVEL_API_KEY || !HIGHLEVEL_LOCATION_ID) {
    console.error('HighLevel credentials not configured');
    return NextResponse.json({ error: 'SMS service not configured' }, { status: 500 });
  }

  let body: SmsRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { phone, url } = body;

  // Input validation
  if (!isNonEmptyString(phone)) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  if (!isNonEmptyString(url)) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const formattedPhone = validatePhone(phone);
  if (!formattedPhone) {
    return NextResponse.json({ error: 'Invalid phone number format (10 digits required)' }, { status: 400 });
  }

  if (!isValidUrl(url)) {
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

    // Try multiple phone formats for lookup
    const phoneFormats = [
      formattedPhone,     // 5551234567
      digits,             // 5551234567
      `1${digits}`,       // 15551234567
    ];

    // Step 1: Try lookup endpoint with different formats
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

    // Step 2: Try search endpoint
    if (!contactId) {
      const searchResponse = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${HIGHLEVEL_LOCATION_ID}&query=${encodeURIComponent(digits)}`,
        { headers }
      );
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        if (searchResult.contacts && searchResult.contacts.length > 0) {
          const match = searchResult.contacts.find((c: { phone?: string }) =>
            c.phone?.replace(/\D/g, '').includes(digits)
          );
          if (match) {
            contactId = match.id;
          }
        }
      }
    }

    // Step 3: Create new contact only if truly not found
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
        throw new Error(createResult.message || 'Failed to create contact');
      }
      contactId = createResult.contact?.id;
    }

    if (!contactId) {
      throw new Error('Could not find or create contact');
    }

    // Step 4: Send SMS to the contact
    const message = `View your Raptor Vending installation progress on your phone: ${url}`;

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
      throw new Error(smsResult.message || 'Failed to send SMS');
    }

    return NextResponse.json({ success: true, messageId: smsResult.messageId || smsResult.id });
  } catch (error) {
    console.error('SMS error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
