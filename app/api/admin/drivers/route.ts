import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';
import type { DriverInsert } from '@/types/database';

// Generate a random access token
function generateAccessToken(length: number = 12): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// GET - List all drivers
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const supabase = getAdminClient();

  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, name, email, phone, is_active, access_token, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching drivers:', error);
      return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Error fetching drivers:', err);
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}

// POST - Create a new driver
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { name?: string; email?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, phone } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    // Generate access token
    const accessToken = generateAccessToken();

    const driverData: DriverInsert = {
      name,
      email: email || '',
      phone: phone || null,
      access_token: accessToken,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('drivers')
      .insert(driverData)
      .select('id, name, email, phone, is_active, access_token, created_at')
      .single();

    if (error) {
      console.error('Error creating driver:', error);
      return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Error creating driver:', err);
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 });
  }
}

// PATCH - Update a driver
export async function PATCH(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { id?: string; name?: string; email?: string; phone?: string; is_active?: boolean; regenerateToken?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, name, email, phone, is_active, regenerateToken } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (regenerateToken) {
      updateData.access_token = generateAccessToken();
    }

    const { data, error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', id)
      .select('id, name, email, phone, is_active, access_token, created_at, updated_at')
      .single();

    if (error) {
      console.error('Error updating driver:', error);
      return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Error updating driver:', err);
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}

// DELETE - Delete a driver
export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const { error } = await supabase
      .from('drivers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting driver:', error);
      return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting driver:', err);
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
  }
}
