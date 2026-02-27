import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { isNonEmptyString, isValidEmail, validatePhone } from '@/lib/validators';

interface SyncContactRequest {
  name: string;
  email: string;
  phone?: string;
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
    return NextResponse.json({ error: 'HighLevel not configured' }, { status: 500 });
  }

  let body: SyncContactRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, phone } = body;

  // Input validation
  if (!isNonEmptyString(name)) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  // Phone is optional but validate if provided
  if (phone && !validatePhone(phone)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  const headers = {
    'Authorization': `Bearer ${HIGHLEVEL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    // Search for existing contact by email
    const searchResponse = await fetch(
      `https://services.leadconnectorhq.com/contacts/search?query=${encodeURIComponent(email)}&locationId=${HIGHLEVEL_LOCATION_ID}`,
      { headers }
    );
    const searchResult = await searchResponse.json();

    let contactId: string | undefined;

    if (searchResult.contacts && searchResult.contacts.length > 0) {
      // Contact exists, update if needed
      contactId = searchResult.contacts[0].id;

      // Update contact with latest info
      await fetch(
        `https://services.leadconnectorhq.com/contacts/${contactId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name,
            email,
            phone: phone ? `+1${phone.replace(/\D/g, '')}` : undefined,
            locationId: HIGHLEVEL_LOCATION_ID,
          }),
        }
      );
    } else {
      // Create new contact
      const createResponse = await fetch(
        'https://services.leadconnectorhq.com/contacts/',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name,
            email,
            phone: phone ? `+1${phone.replace(/\D/g, '')}` : undefined,
            locationId: HIGHLEVEL_LOCATION_ID,
            source: 'Raptor Portal',
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

    return NextResponse.json({ success: true, contactId });
  } catch (error) {
    console.error('HighLevel sync error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
