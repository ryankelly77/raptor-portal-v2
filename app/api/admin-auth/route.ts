import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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

    // NUCLEAR FIX: Inline JWT creation, no shared lib
    const secret = process.env.JWT_SECRET;
    console.log('[AUTH] Secret exists:', !!secret, 'length:', secret?.length);

    if (!secret) {
      console.error('[AUTH] JWT_SECRET not configured!');
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '24h' });
    console.log('[AUTH] Token created, first 20 chars:', token.substring(0, 20));

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
