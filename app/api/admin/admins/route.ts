import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';
import type { Admin, AdminInsert } from '@/types/database';

// Generate a random password
function generatePassword(length: number = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
}

// GET - List all admins
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const supabase = getAdminClient();

  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, email, name, role, is_active, last_login, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching admins:', error);
      return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Error fetching admins:', err);
    return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
  }
}

// POST - Create a new admin
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { email?: string; name?: string; role?: string; generatePassword?: boolean; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, name, role = 'admin', generatePassword: shouldGeneratePassword = true, password: providedPassword } = body;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json({ error: 'An admin with this email already exists' }, { status: 400 });
    }

    // Generate or use provided password
    const plainPassword = shouldGeneratePassword ? generatePassword() : providedPassword;
    if (!plainPassword) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const adminData: AdminInsert = {
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name,
      role: role as Admin['role'],
      is_active: true,
    };

    const { data, error } = await supabase
      .from('admins')
      .insert(adminData)
      .select('id, email, name, role, is_active, created_at')
      .single();

    if (error) {
      console.error('Error creating admin:', error);
      return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 });
    }

    // Return the plain password only if it was generated (so admin can share it)
    return NextResponse.json({
      data,
      ...(shouldGeneratePassword && { generatedPassword: plainPassword }),
    });
  } catch (err) {
    console.error('Error creating admin:', err);
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 });
  }
}

// PATCH - Update an admin
export async function PATCH(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { id?: string; name?: string; role?: string; is_active?: boolean; resetPassword?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, name, role, is_active, resetPassword } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (is_active !== undefined) updateData.is_active = is_active;

    let newPassword: string | undefined;
    if (resetPassword) {
      newPassword = generatePassword();
      updateData.password_hash = await bcrypt.hash(newPassword, 10);
    }

    const { data, error } = await supabase
      .from('admins')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, role, is_active, last_login, created_at')
      .single();

    if (error) {
      console.error('Error updating admin:', error);
      return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 });
    }

    return NextResponse.json({
      data,
      ...(newPassword && { generatedPassword: newPassword }),
    });
  } catch (err) {
    console.error('Error updating admin:', err);
    return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 });
  }
}

// DELETE - Delete an admin
export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting admin:', error);
      return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting admin:', err);
    return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 });
  }
}
