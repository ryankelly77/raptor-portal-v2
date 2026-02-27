import { NextResponse } from 'next/server';
import { createAdminToken } from '@/lib/auth/jwt';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'raptor-admin-2024';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ success: false, error: 'Password required' }, { status: 400 });
    }

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
    }

    // Generate JWT token using shared auth module
    const token = createAdminToken();
    console.log('[LOGIN SUCCESS] Token created, length:', token.length, 'prefix:', token.substring(0, 20));

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
