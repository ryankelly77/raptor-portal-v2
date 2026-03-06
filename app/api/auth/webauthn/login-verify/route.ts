import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { rpID, origin, getAndRemoveChallenge, getUserCredentials } from '@/lib/webauthn';
import { getAdminClient } from '@/lib/supabase/admin';
import { createAdminToken } from '@/lib/auth/jwt';

// Helper to convert base64url to Uint8Array
function base64urlToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function POST(request: NextRequest) {
  let body: {
    response: any;
    userId: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { response, userId } = body;

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  // Get stored challenge
  const expectedChallenge = getAndRemoveChallenge(userId);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
  }

  try {
    // Get user credentials
    const credentials = await getUserCredentials(userId, 'admin');
    // The response.id is already base64url encoded
    const credentialId = response.id;
    const credential = credentials.find((c) => c.credential_id === credentialId);

    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.credential_id, // base64url string
        publicKey: base64urlToUint8Array(credential.public_key),
        counter: credential.counter,
        transports: (credential.transports || ['internal']) as AuthenticatorTransport[],
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    // Update counter and last_used
    const supabase = getAdminClient();

    await supabase
      .from('webauthn_credentials')
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used: new Date().toISOString(),
      })
      .eq('id', credential.id);

    // Get admin details for token
    const { data: admin } = await supabase
      .from('admins')
      .select('*')
      .eq('id', userId)
      .single();

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    // Update last_login
    await supabase
      .from('admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id);

    // Generate JWT token
    const token = createAdminToken({
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });

    return NextResponse.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error('Error verifying authentication:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
