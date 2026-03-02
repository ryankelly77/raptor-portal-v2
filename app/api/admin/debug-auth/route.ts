import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({
      error: 'No Bearer token provided',
      hasAuthHeader: !!authHeader,
      authHeaderStart: authHeader?.substring(0, 30),
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return NextResponse.json({
      error: 'JWT_SECRET not configured',
      secretExists: false,
    });
  }

  try {
    const decoded = jwt.verify(token, secret);
    return NextResponse.json({
      success: true,
      tokenValid: true,
      payload: decoded,
      secretLength: secret.length,
    });
  } catch (err) {
    // Try to decode without verification to see what's in the token
    let decodedWithoutVerify = null;
    try {
      decodedWithoutVerify = jwt.decode(token);
    } catch {
      // ignore
    }

    return NextResponse.json({
      error: 'Token verification failed',
      verifyError: err instanceof Error ? err.message : 'Unknown error',
      tokenLength: token.length,
      tokenStart: token.substring(0, 30),
      secretLength: secret.length,
      decodedWithoutVerify,
    });
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({
      authorized: false,
      error: 'No authorization token',
      hasAuthHeader: !!authHeader,
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return NextResponse.json({
      authorized: false,
      error: 'Server configuration error - no JWT_SECRET',
    });
  }

  try {
    jwt.verify(token, secret);
    return NextResponse.json({
      authorized: true,
      tokenValid: true,
    });
  } catch (err) {
    return NextResponse.json({
      authorized: false,
      error: 'Invalid or expired token',
      verifyError: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
