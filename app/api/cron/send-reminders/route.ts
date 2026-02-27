import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/jwt';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'reminders.raptor-vending.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Raptor Vending <noreply@reminders.raptor-vending.com>';
const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.raptor-vending.com';

// Default CC emails (used if database template not available)
const DEFAULT_CC_EMAILS = 'ryan@raptor-vending.com, tracie@raptor-vending.com, cristian@raptor-vending.com';

interface EmailTemplate {
  cc_emails?: string;
}

interface Task {
  id: string;
  label: string;
  completed: boolean;
  sort_order: number;
}

interface Phase {
  id: string;
  phase_number: number;
  tasks: Task[];
}

interface Project {
  id: string;
  public_token: string;
  project_number: string;
  reminder_email: string | null;
  email_reminders_enabled: boolean;
  last_reminder_sent: string | null;
  location: {
    name: string;
    property: {
      name: string;
      property_manager: {
        name: string;
        email: string;
      } | null;
    } | null;
  } | null;
  phases: Phase[];
}

async function getEmailTemplate(supabase: ReturnType<typeof getAdminClient>, templateKey: string): Promise<EmailTemplate | null> {
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

async function sendEmail(to: string, subject: string, html: string, ccEmails: string | undefined, projectId: string | null = null): Promise<void> {
  const form = new URLSearchParams();
  form.append('from', FROM_EMAIL);
  form.append('to', to);
  if (ccEmails) {
    form.append('cc', ccEmails);
  }
  form.append('subject', subject);
  form.append('html', html);

  // Enable open and click tracking
  form.append('o:tracking', 'yes');
  form.append('o:tracking-clicks', 'yes');
  form.append('o:tracking-opens', 'yes');

  // Add project ID as custom variable for webhook correlation
  if (projectId) {
    form.append('v:project_id', projectId);
  }

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
    console.error(`Mailgun error [${response.status}]:`, errorText, `Domain: ${MAILGUN_DOMAIN}, To: ${to}`);
    throw new Error(`Mailgun error: ${response.statusText}`);
  }
}

function generateReminderEmail(project: Project, allTasks: Task[], incompleteCount: number, propertyName: string, firstName: string): string {
  const projectUrl = `${PORTAL_URL}/project/${project.public_token}`;
  const logoUrl = `${PORTAL_URL}/logo-light.png`;
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';

  const taskList = allTasks.map(t => {
    const label = t.label.replace(/^\[(PM|PM-TEXT)\]\s*/, '');
    if (t.completed) {
      return `<tr>
        <td style="width: 32px; padding: 8px 12px 8px 0; vertical-align: top;">
          <div style="width: 24px; height: 24px; background: #FF6B00; border-radius: 4px; text-align: center; line-height: 24px;">
            <span style="color: white; font-size: 16px; font-weight: bold;">&#10003;</span>
          </div>
        </td>
        <td style="padding: 8px 0; vertical-align: middle; color: #999; text-decoration: line-through;">${label}</td>
      </tr>`;
    } else {
      return `<tr>
        <td style="width: 32px; padding: 8px 12px 8px 0; vertical-align: top;">
          <div style="width: 24px; height: 24px; border: 2px solid #FF6B00; border-radius: 4px; box-sizing: border-box;"></div>
        </td>
        <td style="padding: 8px 0; vertical-align: middle;">${label}</td>
      </tr>`;
    }
  }).join('');

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
        <p style="font-size: 16px;">${greeting}</p>

        <p style="font-size: 16px;">This is a friendly reminder that there are <strong>${incompleteCount} item${incompleteCount !== 1 ? 's' : ''}</strong> we need your help with in order to get hot, gourmet food into <strong>${propertyName}</strong>.</p>

        <p style="font-size: 16px; margin-top: 24px;"><strong>Your progress:</strong></p>
        <div style="background: #f9f9f9; padding: 20px; border-radius: 4px; border-left: 4px solid #FF6B00; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            ${taskList}
          </table>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${projectUrl}" style="background: #FF6B00; color: white; padding: 14px 36px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; font-size: 16px;">Complete Your Items</a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact your Raptor Vending representative.</p>
      </div>

      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>Raptor Vending Installation Portal</p>
      </div>
    </body>
    </html>
  `;
}

export async function GET(request: NextRequest) {
  // Allow either CRON_SECRET (for scheduled jobs) or admin token (for manual trigger)
  const cronSecret = request.headers.get('x-cron-secret');
  const isCronAuth = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

  let isAdminAuth = false;
  if (!isCronAuth) {
    const auth = requireAdmin(request);
    isAdminAuth = auth.authorized;
  }

  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!MAILGUN_API_KEY) {
    return NextResponse.json({ error: 'Mailgun API key not configured' }, { status: 500 });
  }

  // Parse query params for optional overrides
  const url = new URL(request.url);
  const forceResend = url.searchParams.get('force') === 'true';
  const singleProjectId = url.searchParams.get('projectId');

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Fetch the email template for CC emails
    const template = await getEmailTemplate(supabase, 'weekly-reminder');
    const ccEmails = template?.cc_emails || DEFAULT_CC_EMAILS;

    // Fetch projects with reminders enabled
    let query = supabase
      .from('projects')
      .select(`
        id,
        public_token,
        project_number,
        reminder_email,
        email_reminders_enabled,
        last_reminder_sent,
        location:locations (
          name,
          property:properties (
            name,
            property_manager:property_managers (
              name,
              email
            )
          )
        ),
        phases (
          id,
          phase_number,
          tasks (
            id,
            label,
            completed,
            sort_order
          )
        )
      `);

    if (singleProjectId) {
      query = query.eq('id', singleProjectId);
    } else {
      query = query.eq('email_reminders_enabled', true);
    }

    const { data: projects, error: projectsError } = await query;

    if (projectsError) {
      throw new Error(`Database error: ${projectsError.message}`);
    }

    const results: Array<{ project: string; status: string; reason?: string; to?: string; tasks?: number; error?: string }> = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const project of (projects || []) as unknown as Project[]) {
      const propertyName = project.location?.property?.name || project.location?.name || project.project_number;
      const pmEmail = project.location?.property?.property_manager?.email;
      const pmFullName = project.location?.property?.property_manager?.name || '';
      const firstName = pmFullName.split(' ')[0] || '';

      // Skip if reminded in the last 24 hours (unless force flag is set)
      if (!forceResend && project.last_reminder_sent && new Date(project.last_reminder_sent) > oneDayAgo) {
        results.push({ project: propertyName, status: 'skipped', reason: 'Recently reminded' });
        continue;
      }

      // Get all PM tasks in order
      const sortedPhases = (project.phases || []).sort((a, b) => a.phase_number - b.phase_number);
      const allPmTasks: Task[] = [];
      for (const phase of sortedPhases) {
        const sortedTasks = (phase.tasks || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        for (const task of sortedTasks) {
          if (task.label.startsWith('[PM]') || task.label.startsWith('[PM-TEXT]')) {
            allPmTasks.push(task);
          }
        }
      }

      const incompleteCount = allPmTasks.filter(t => !t.completed).length;

      // Skip if no incomplete tasks
      if (incompleteCount === 0) {
        results.push({ project: propertyName, status: 'skipped', reason: 'No incomplete tasks' });
        continue;
      }

      // Determine recipient email
      const recipientEmail = project.reminder_email || pmEmail;
      if (!recipientEmail) {
        results.push({ project: propertyName, status: 'skipped', reason: 'No email address' });
        continue;
      }

      // Send the reminder email
      try {
        const html = generateReminderEmail(project, allPmTasks, incompleteCount, propertyName, firstName);
        await sendEmail(
          recipientEmail,
          `Reminder: ${incompleteCount} item${incompleteCount !== 1 ? 's' : ''} remaining for ${propertyName}`,
          html,
          ccEmails,
          project.id
        );

        // Update last_reminder_sent
        await supabase
          .from('projects')
          .update({ last_reminder_sent: now.toISOString() })
          .eq('id', project.id);

        // Log to activity stream
        await supabase
          .from('activity_log')
          .insert({
            project_id: project.id,
            action: 'reminder_sent',
            description: `Weekly reminder sent to ${recipientEmail} (${incompleteCount} pending item${incompleteCount !== 1 ? 's' : ''})`,
            actor_type: 'system',
          });

        results.push({ project: propertyName, status: 'sent', to: recipientEmail, tasks: incompleteCount });
      } catch (emailError) {
        console.error(`Failed to send to ${propertyName}:`, emailError instanceof Error ? emailError.message : emailError);
        results.push({ project: propertyName, status: 'error', error: emailError instanceof Error ? emailError.message : 'Unknown error' });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    });
  } catch (error) {
    console.error('Reminder error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
