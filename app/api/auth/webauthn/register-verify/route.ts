import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { rpID, origin, getAndRemoveChallenge } from '@/lib/webauthn';
import { getAdminClient } from '@/lib/supabase/admin';
import type { WebAuthnCredentialInsert } from '@/types/database';

// Helper to convert Uint8Array to base64url
function uint8ArrayToBase64url(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function POST(request: NextRequest) {
  // User must be logged in
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const payload = auth.payload as { adminId?: string; email?: string };
  const adminId = payload.adminId;

  if (!adminId) {
    return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
  }

  let body: {
    response: any;
    deviceName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { response, deviceName } = body;

  // Get stored challenge
  const expectedChallenge = getAndRemoveChallenge(adminId);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Store credential in database
    const supabase = getAdminClient();

    // In SimpleWebAuthn v9+:
    // - credential.id is a base64url string
    // - credential.publicKey is a Uint8Array
    const credentialIdBase64url = credential.id; // Already base64url string
    const publicKeyBase64url = uint8ArrayToBase64url(credential.publicKey);

    const credentialData: WebAuthnCredentialInsert = {
      user_id: adminId,
      user_type: 'admin',
      credential_id: credentialIdBase64url,
      public_key: publicKeyBase64url,
      counter: credential.counter,
      transports: response.response.transports || null,
      device_name: deviceName || `${credentialDeviceType}${credentialBackedUp ? ' (backed up)' : ''}`,
    };

    const { error } = await supabase
      .from('webauthn_credentials')
      .insert(credentialData);

    if (error) {
      console.error('Error storing credential:', error);
      return NextResponse.json({ error: 'Failed to store credential' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Biometric login enabled successfully',
    });
  } catch (err) {
    console.error('Error verifying registration:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
