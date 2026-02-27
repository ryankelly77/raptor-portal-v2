import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminClient } from '@/lib/supabase/admin';

interface MailgunWebhookBody {
  signature?: {
    timestamp: string;
    token: string;
    signature: string;
  };
  'event-data'?: {
    event: string;
    recipient: string;
    'user-variables'?: {
      project_id?: string;
    };
  };
}

// Verify Mailgun webhook signature
function verifyWebhookSignature(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.warn('MAILGUN_WEBHOOK_SIGNING_KEY not configured, skipping verification');
    return true; // Allow in dev, but log warning
  }

  const encodedToken = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp.concat(token))
    .digest('hex');

  return encodedToken === signature;
}

export async function POST(request: NextRequest) {
  let body: MailgunWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const { signature, 'event-data': eventData } = body;

    // Verify signature if signing key is configured
    if (signature) {
      const isValid = verifyWebhookSignature(
        signature.timestamp,
        signature.token,
        signature.signature
      );
      if (!isValid) {
        console.error('Invalid Mailgun webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    if (!eventData) {
      return NextResponse.json({ error: 'No event data' }, { status: 400 });
    }

    const eventType = eventData.event;
    const recipient = eventData.recipient;
    const projectId = eventData['user-variables']?.project_id;

    console.log(`[Mailgun Webhook] Event: ${eventType}, Recipient: ${recipient}, Project: ${projectId}`);

    // Only log opens and clicks
    if (eventType === 'opened' || eventType === 'clicked') {
      let supabase: ReturnType<typeof getAdminClient>;
      try {
        supabase = getAdminClient();
      } catch (err) {
        console.error('Supabase admin client error:', err);
        return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
      }

      const description = eventType === 'opened'
        ? `Email opened by ${recipient}`
        : `Email link clicked by ${recipient}`;

      await supabase
        .from('activity_log')
        .insert({
          project_id: projectId || null,
          action: eventType === 'opened' ? 'email_opened' : 'email_clicked',
          description,
          actor_type: 'system',
        });

      console.log(`[Mailgun Webhook] Logged ${eventType} event to activity stream`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mailgun webhook error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
