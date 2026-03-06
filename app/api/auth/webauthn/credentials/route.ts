import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';

// GET - List credentials for current user
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const payload = auth.payload as { adminId?: string };
  const adminId = payload.adminId;

  if (!adminId) {
    return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select('id, device_name, created_at, last_used')
    .eq('user_id', adminId)
    .eq('user_type', 'admin')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching credentials:', error);
    return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE - Remove a credential
export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const payload = auth.payload as { adminId?: string };
  const adminId = payload.adminId;

  if (!adminId) {
    return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const credentialId = searchParams.get('id');

  if (!credentialId) {
    return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Only allow deleting own credentials
  const { error } = await supabase
    .from('webauthn_credentials')
    .delete()
    .eq('id', credentialId)
    .eq('user_id', adminId);

  if (error) {
    console.error('Error deleting credential:', error);
    return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
