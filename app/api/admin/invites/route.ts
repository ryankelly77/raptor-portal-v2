import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';
import type { UserInviteInsert } from '@/types/database';

// Generate a secure random token
function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// GET - List all pending invites
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const supabase = getAdminClient();

  try {
    const { data, error } = await supabase
      .from('user_invites')
      .select('*')
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invites:', error);
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Error fetching invites:', err);
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
  }
}

// POST - Create a new invite
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: {
    user_type: 'admin' | 'driver';
    email?: string;
    phone?: string;
    sendEmail?: boolean;
    sendSMS?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { user_type, email, phone, sendEmail = true, sendSMS = false } = body;

  if (!user_type || !['admin', 'driver'].includes(user_type)) {
    return NextResponse.json({ error: 'user_type must be "admin" or "driver"' }, { status: 400 });
  }

  if (user_type === 'admin' && !email) {
    return NextResponse.json({ error: 'Email is required for admin invites' }, { status: 400 });
  }

  if (user_type === 'driver' && !email && !phone) {
    return NextResponse.json({ error: 'Email or phone is required for driver invites' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const token = generateToken();
    const expiresAt = new Date();

    // Admin invites expire in 24 hours, driver invites in 7 days
    if (user_type === 'admin') {
      expiresAt.setHours(expiresAt.getHours() + 24);
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    const inviteData: UserInviteInsert = {
      user_type,
      token,
      expires_at: expiresAt.toISOString(),
      email: email?.toLowerCase() || null,
      phone: phone || null,
      created_by: (auth.payload as { adminId?: string })?.adminId || null,
    };

    const { data, error } = await supabase
      .from('user_invites')
      .insert(inviteData)
      .select()
      .single();

    if (error) {
      console.error('Error creating invite:', error);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://portal.raptor-vending.com'}/invite/${token}`;

    // Send email if requested and email is provided
    if (sendEmail && email) {
      try {
        const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
        const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;

        if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
          const form = new FormData();
          form.append('from', 'Raptor Vending <noreply@raptor-vending.com>');
          form.append('to', email);
          form.append('subject', user_type === 'admin'
            ? 'You have been invited to Raptor Vending Admin Portal'
            : 'You have been invited to Raptor Vending Driver Portal'
          );
          form.append('html', `
            <h2>You're Invited!</h2>
            <p>You have been invited to join the Raptor Vending ${user_type === 'admin' ? 'Admin' : 'Driver'} Portal.</p>
            <p>Click the link below to accept your invitation:</p>
            <p><a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #ea580c; color: white; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
            <p>This link will expire in ${user_type === 'admin' ? '24 hours' : '7 days'}.</p>
            <p style="color: #666; font-size: 12px;">If you didn't expect this invitation, you can ignore this email.</p>
          `);

          await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
            },
            body: form,
          });
        }
      } catch (emailError) {
        console.error('Failed to send invite email:', emailError);
        // Don't fail the request, just log the error
      }
    }

    // Send SMS if requested and phone is provided
    if (sendSMS && phone) {
      try {
        const HIGHLEVEL_API_KEY = process.env.HIGHLEVEL_API_KEY;
        const HIGHLEVEL_LOCATION_ID = process.env.HIGHLEVEL_LOCATION_ID;

        if (HIGHLEVEL_API_KEY && HIGHLEVEL_LOCATION_ID) {
          const headers = {
            'Authorization': `Bearer ${HIGHLEVEL_API_KEY}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          };

          // Find or create contact
          const lookupResponse = await fetch(
            `https://services.leadconnectorhq.com/contacts/lookup?locationId=${HIGHLEVEL_LOCATION_ID}&phone=${encodeURIComponent(phone)}`,
            { headers }
          );

          let contactId: string | undefined;

          if (lookupResponse.ok) {
            const lookupResult = await lookupResponse.json();
            contactId = lookupResult.contact?.id;
          }

          if (!contactId) {
            const createResponse = await fetch(
              'https://services.leadconnectorhq.com/contacts/',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  phone,
                  locationId: HIGHLEVEL_LOCATION_ID,
                  name: 'Invite Recipient',
                }),
              }
            );
            const createResult = await createResponse.json();
            contactId = createResult.contact?.id;
          }

          if (contactId) {
            const message = `You've been invited to join Raptor Vending ${user_type === 'admin' ? 'Admin' : 'Driver'} Portal. Accept your invite: ${inviteUrl}`;

            await fetch(
              'https://services.leadconnectorhq.com/conversations/messages',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  type: 'SMS',
                  contactId,
                  message,
                }),
              }
            );
          }
        }
      } catch (smsError) {
        console.error('Failed to send invite SMS:', smsError);
        // Don't fail the request
      }
    }

    return NextResponse.json({
      data,
      inviteUrl,
      emailSent: sendEmail && !!email,
      smsSent: sendSMS && !!phone,
    });
  } catch (err) {
    console.error('Error creating invite:', err);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}

// DELETE - Cancel/delete an invite
export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const { error } = await supabase
      .from('user_invites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting invite:', error);
      return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting invite:', err);
    return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 });
  }
}
