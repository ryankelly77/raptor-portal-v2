import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getAdminClient } from '@/lib/supabase/admin';
import type { UserInvite, AdminInsert, DriverInsert } from '@/types/database';

export async function POST(request: NextRequest) {
  let body: {
    token: string;
    name: string;
    password?: string; // Required for admin invites
    phone?: string; // Optional for driver invites
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, name, password, phone } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    // Look up the invite
    const { data: invite, error: inviteError } = await supabase
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
    }

    const typedInvite = invite as UserInvite;

    // Check if expired
    if (new Date(typedInvite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    if (typedInvite.user_type === 'admin') {
      // Admin invite requires password
      if (!password || typeof password !== 'string' || password.length < 8) {
        return NextResponse.json({ error: 'Password is required (minimum 8 characters)' }, { status: 400 });
      }

      if (!typedInvite.email) {
        return NextResponse.json({ error: 'Invalid invite: missing email' }, { status: 400 });
      }

      // Check if admin with this email already exists
      const { data: existingAdmin } = await supabase
        .from('admins')
        .select('id')
        .eq('email', typedInvite.email)
        .single();

      if (existingAdmin) {
        return NextResponse.json({ error: 'An admin with this email already exists' }, { status: 400 });
      }

      // Create admin
      const passwordHash = await bcrypt.hash(password, 10);
      const adminData: AdminInsert = {
        email: typedInvite.email,
        password_hash: passwordHash,
        name,
        role: 'admin',
        is_active: true,
      };

      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .insert(adminData)
        .select('id, email, name, role')
        .single();

      if (adminError) {
        console.error('Error creating admin:', adminError);
        return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 });
      }

      // Mark invite as accepted
      await supabase
        .from('user_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', typedInvite.id);

      return NextResponse.json({
        success: true,
        user_type: 'admin',
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
        },
      });
    } else {
      // Driver invite
      const accessToken = crypto.randomBytes(6).toString('hex');
      const driverData: DriverInsert = {
        name,
        email: typedInvite.email || '',
        phone: phone || typedInvite.phone || null,
        access_token: accessToken,
        is_active: true,
      };

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .insert(driverData)
        .select('id, name, email, phone, access_token')
        .single();

      if (driverError) {
        console.error('Error creating driver:', driverError);
        return NextResponse.json({ error: 'Failed to create driver account' }, { status: 500 });
      }

      // Mark invite as accepted
      await supabase
        .from('user_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', typedInvite.id);

      return NextResponse.json({
        success: true,
        user_type: 'driver',
        driver: {
          id: driver.id,
          name: driver.name,
          access_token: driver.access_token,
        },
      });
    }
  } catch (err) {
    console.error('Error accepting invite:', err);
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
  }
}

// GET - Get invite info (for displaying the accept page)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const { data: invite, error } = await supabase
      .from('user_invites')
      .select('user_type, email, phone, expires_at, accepted_at')
      .eq('token', token)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    return NextResponse.json({
      user_type: invite.user_type,
      email: invite.email,
      phone: invite.phone,
    });
  } catch (err) {
    console.error('Error getting invite:', err);
    return NextResponse.json({ error: 'Failed to get invite' }, { status: 500 });
  }
}
