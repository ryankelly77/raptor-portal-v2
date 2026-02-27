import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'raptor-admin-2024';
const JWT_SECRET = process.env.JWT_SECRET || 'raptor-jwt-secret-key';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ success: false, error: 'Password required' }, { status: 400 });
    }

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
    }

    // Generate JWT token
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
