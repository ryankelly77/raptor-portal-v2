import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';
import { isNonEmptyString, isValidId } from '@/lib/validators';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'reminders.raptor-vending.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Raptor Vending <noreply@reminders.raptor-vending.com>';
const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.raptor-vending.com';

const DEFAULT_CC_EMAILS = 'ryan@raptor-vending.com, tracie@raptor-vending.com, cristian@raptor-vending.com';

interface DeliveryInfo {
  equipment: string;
  date: string;
  tracking: string;
  carrier?: string;
}

interface DeliveryNotificationRequest {
  projectId: string;
  delivery: DeliveryInfo;
}

async function getEmailTemplate(supabase: ReturnType<typeof getAdminClient>, templateKey: string) {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('template_key', templateKey)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching email template:', error);
  }
  return data;
}

async function sendEmail(to: string, subject: string, html: string, ccEmails: string | undefined): Promise<void> {
  const form = new URLSearchParams();
  form.append('from', FROM_EMAIL);
  form.append('to', to);
  if (ccEmails) {
    form.append('cc', ccEmails);
  }
  form.append('subject', subject);
  form.append('html', html);

  const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailgun error: ${errorText}`);
  }
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function generateDeliveryEmail(delivery: DeliveryInfo, propertyName: string, projectToken: string, firstName: string): string {
  const logoUrl = `${PORTAL_URL}/logo-light.png`;
  const projectUrl = `${PORTAL_URL}/project/${projectToken}`;
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  const formattedDate = formatDate(delivery.date);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: #202020; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <img src="${logoUrl}" alt="Raptor Vending" style="max-width: 200px; height: auto;" />
      </div>

      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #FF6B00; font-size: 28px; margin: 0 0 20px 0; text-align: center;">Equipment is on the way!</h1>

        <p style="font-size: 16px;">${greeting}</p>

        <p style="font-size: 16px;">Great news! Equipment for <strong>${propertyName}</strong> has shipped and is on its way.</p>

        <div style="background: #f9f9f9; padding: 20px; border-radius: 4px; border-left: 4px solid #FF6B00; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 140px;">Equipment:</td>
              <td style="padding: 8px 0;">${delivery.equipment}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Delivery Date:</td>
              <td style="padding: 8px 0;">${formattedDate}</td>
            </tr>
            ${delivery.carrier ? `<tr>
              <td style="padding: 8px 0; font-weight: bold;">Carrier:</td>
              <td style="padding: 8px 0;">${delivery.carrier}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Tracking Number:</td>
              <td style="padding: 8px 0;">${delivery.tracking}</td>
            </tr>
          </table>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${projectUrl}" style="background: #FF6B00; color: white; padding: 14px 36px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; font-size: 16px;">View Installation Progress</a>
        </p>

        <p style="font-size: 16px; background: #f0f0f0; padding: 16px; border-radius: 4px; margin-top: 24px;">Raptor Vending will be onsite to accept the delivery and ensure the items are satisfactory. We will need a secure area to store the equipment until the health inspection.</p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact your Raptor Vending representative.</p>
      </div>

      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>Raptor Vending Installation Portal</p>
      </div>
    </body>
    </html>
  `;
}

export async function POST(request: NextRequest) {
  // Admin authentication
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  // Environment validation
  if (!MAILGUN_API_KEY) {
    console.error('MAILGUN_API_KEY not configured');
    return NextResponse.json({ error: 'Mailgun API key not configured' }, { status: 500 });
  }

  let body: DeliveryNotificationRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { projectId, delivery } = body;

  // Input validation
  if (!isValidId(projectId)) {
    return NextResponse.json({ error: 'Valid projectId is required' }, { status: 400 });
  }

  if (!delivery || typeof delivery !== 'object') {
    return NextResponse.json({ error: 'Delivery data is required' }, { status: 400 });
  }

  if (!isNonEmptyString(delivery.equipment)) {
    return NextResponse.json({ error: 'Delivery equipment is required' }, { status: 400 });
  }

  if (!isNonEmptyString(delivery.date)) {
    return NextResponse.json({ error: 'Delivery date is required' }, { status: 400 });
  }

  if (!isNonEmptyString(delivery.tracking)) {
    return NextResponse.json({ error: 'Delivery tracking number is required' }, { status: 400 });
  }

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Fetch the email template for CC emails
    const template = await getEmailTemplate(supabase, 'delivery-notification');
    const ccEmails = (template as { cc_emails?: string } | null)?.cc_emails || DEFAULT_CC_EMAILS;

    // Fetch project with location/property/PM info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        public_token,
        reminder_email,
        location:locations (
          name,
          property:properties (
            name,
            property_manager:property_managers (
              name,
              email
            )
          )
        )
      `)
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error('Project not found');
    }

    const location = project.location as unknown as {
      name: string;
      property: {
        name: string;
        property_manager: { name: string; email: string } | null;
      } | null;
    } | null;

    const propertyName = location?.property?.name || location?.name || 'your location';
    const pmEmail = location?.property?.property_manager?.email;
    const pmFullName = location?.property?.property_manager?.name || '';
    const firstName = pmFullName.split(' ')[0] || '';

    // Use reminder_email override if set, otherwise PM email
    const recipientEmail = (project.reminder_email as string | null) || pmEmail;

    if (!recipientEmail) {
      return NextResponse.json({ error: 'No recipient email found for this project' }, { status: 400 });
    }

    const html = generateDeliveryEmail(delivery, propertyName, project.public_token as string, firstName);

    await sendEmail(
      recipientEmail,
      `Equipment on the way to ${propertyName} - ${delivery.equipment}`,
      html,
      ccEmails
    );

    return NextResponse.json({
      success: true,
      to: recipientEmail,
      equipment: delivery.equipment,
    });
  } catch (error) {
    console.error('Delivery notification error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
