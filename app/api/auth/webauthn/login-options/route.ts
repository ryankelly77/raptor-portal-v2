import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpID, storeChallenge, getUserCredentials, findAdminByEmail } from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  let body: { email: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    // Find admin by email
    const admin = await findAdminByEmail(email);
    if (!admin) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get credentials for this user
    const credentials = await getUserCredentials(admin.id, 'admin');
    if (credentials.length === 0) {
      return NextResponse.json({ error: 'No biometric credentials registered' }, { status: 404 });
    }

    // Convert to allowCredentials format (v9+ uses base64url strings)
    const allowCredentials = credentials.map((cred) => ({
      id: cred.credential_id, // Already base64url encoded
      transports: (cred.transports || ['internal']) as AuthenticatorTransport[],
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'required',
    });

    // Store challenge with admin ID
    storeChallenge(admin.id, options.challenge);

    return NextResponse.json({
      ...options,
      // Include admin ID for verification (encrypted/signed in production)
      userId: admin.id,
    });
  } catch (err) {
    console.error('Error generating authentication options:', err);
    return NextResponse.json({ error: 'Failed to generate authentication options' }, { status: 500 });
  }
}
