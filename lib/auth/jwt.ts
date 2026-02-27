import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

// JWT_SECRET is required - no fallback to prevent secret mismatch between serverless instances
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
  return secret;
}

const JWT_EXPIRATION = '8h';
const DRIVER_JWT_EXPIRATION = '4h';

export interface AdminTokenPayload {
  type: 'admin';
  iat: number;
  exp: number;
}

export interface DriverTokenPayload {
  type: 'driver';
  driverId: string;
  email: string;
  iat: number;
  exp: number;
}

export type TokenPayload = AdminTokenPayload | DriverTokenPayload;

export function createAdminToken(): string {
  return jwt.sign({ type: 'admin' }, getJwtSecret(), { expiresIn: JWT_EXPIRATION });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    if (decoded.type !== 'admin') {
      return null;
    }
    return decoded as AdminTokenPayload;
  } catch {
    return null;
  }
}

export function createDriverToken(driverId: string, email: string): string {
  return jwt.sign(
    { type: 'driver', driverId, email },
    getJwtSecret(),
    { expiresIn: DRIVER_JWT_EXPIRATION }
  );
}

export function verifyDriverToken(token: string): DriverTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    if (decoded.type !== 'driver') {
      return null;
    }
    return decoded as DriverTokenPayload;
  } catch {
    return null;
  }
}

export function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

export interface AuthResult {
  authorized: boolean;
  payload?: TokenPayload;
  error?: string;
}

export function requireAdmin(request: NextRequest): AuthResult {
  const token = extractToken(request);
  if (!token) {
    return { authorized: false, error: 'No authorization token provided' };
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return { authorized: false, error: 'Invalid or expired admin token' };
  }

  return { authorized: true, payload };
}

export function requireDriver(request: NextRequest): AuthResult {
  const token = extractToken(request);
  if (!token) {
    return { authorized: false, error: 'No authorization token provided' };
  }

  const payload = verifyDriverToken(token);
  if (!payload) {
    return { authorized: false, error: 'Invalid or expired driver token' };
  }

  return { authorized: true, payload };
}
