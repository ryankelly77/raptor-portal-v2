import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, extractToken, verifyAdminToken } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  const token = extractToken(request);

  if (!token) {
    return NextResponse.json({
      error: 'No token provided',
      hasAuthHeader: !!request.headers.get('authorization'),
      authHeaderStart: request.headers.get('authorization')?.substring(0, 20),
    });
  }

  const payload = verifyAdminToken(token);

  if (!payload) {
    return NextResponse.json({
      error: 'Invalid token',
      tokenLength: token.length,
      tokenStart: token.substring(0, 20),
    });
  }

  return NextResponse.json({
    success: true,
    payload,
    tokenValid: true,
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);

  return NextResponse.json({
    authorized: auth.authorized,
    error: auth.error || null,
    hasToken: !!extractToken(request),
  });
}
