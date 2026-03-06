import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { rpName, rpID, storeChallenge, getUserCredentials } from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  // User must be logged in to register a credential
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const payload = auth.payload as { adminId?: string; email?: string; name?: string };
  const adminId = payload.adminId;
  const email = payload.email;
  const name = payload.name;

  if (!adminId || !email) {
    return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
  }

  try {
    // Get existing credentials for this user
    const existingCredentials = await getUserCredentials(adminId, 'admin');

    // Convert existing credentials to excludeCredentials format (v9+ uses base64url strings)
    const excludeCredentials = existingCredentials.map((cred) => ({
      id: cred.credential_id, // Already base64url encoded
      transports: (cred.transports || ['internal']) as AuthenticatorTransport[],
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(adminId),
      userName: email,
      userDisplayName: name || email,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    // Store challenge for verification
    await storeChallenge(adminId, options.challenge);

    return NextResponse.json(options);
  } catch (err) {
    console.error('Error generating registration options:', err);
    return NextResponse.json({ error: 'Failed to generate registration options' }, { status: 500 });
  }
}
