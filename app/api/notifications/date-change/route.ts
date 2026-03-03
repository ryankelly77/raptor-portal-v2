import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/jwt';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'reminders.raptor-vending.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Raptor Vending <noreply@reminders.raptor-vending.com>';
const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.raptor-vending.com';

interface Task {
  label: string;
  completed: boolean;
}

interface Phase {
  title: string;
  status: string;
  tasks: Task[];
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  ccEmails: string,
  projectId: string
): Promise<void> {
  console.log('[DateChangeEmail] Sending to:', to, 'CC:', ccEmails);

  const form = new URLSearchParams();
  form.append('from', FROM_EMAIL);
  form.append('to', to);
  if (ccEmails) {
    form.append('cc', ccEmails);
  }
  form.append('subject', subject);
  form.append('html', html);
  form.append('o:tracking', 'yes');
  form.append('o:tracking-clicks', 'yes');
  form.append('o:tracking-opens', 'yes');
  form.append('v:project_id', projectId);
  form.append('v:email_type', 'date_change');

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
    console.error(`Mailgun error [${response.status}]:`, errorText);
    throw new Error(`Mailgun error: ${response.statusText}`);
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function generateDateChangeEmail(
  pmFirstName: string,
  propertyName: string,
  locationName: string,
  projectNumber: string,
  oldDate: string | null,
  newDate: string,
  reason: string | null,
  phases: Phase[],
  projectUrl: string
): string {
  const logoUrl = `${PORTAL_URL}/logo-light.png`;
  const greeting = pmFirstName ? `Hi ${pmFirstName},` : 'Hello,';

  // Build task status list
  let taskStatusHtml = '';
  for (const phase of phases) {
    const phaseTasks = phase.tasks || [];
    const pmTasks = phaseTasks.filter(t => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'));

    if (pmTasks.length > 0) {
      taskStatusHtml += `<tr><td colspan="2" style="padding: 12px 0 4px 0; font-weight: 600; color: #333;">${phase.title}</td></tr>`;

      for (const task of pmTasks) {
        const label = task.label.replace(/^\[(PM|PM-TEXT)\]\s*/, '');
        const statusIcon = task.completed
          ? '<span style="color: #22c55e; font-weight: bold;">&#10003;</span>'
          : '<span style="color: #f59e0b;">&#9675;</span>';
        const statusText = task.completed ? 'Complete' : 'Pending';

        taskStatusHtml += `
          <tr>
            <td style="padding: 6px 12px 6px 16px; color: #555;">${statusIcon} ${label}</td>
            <td style="padding: 6px 0; color: ${task.completed ? '#22c55e' : '#f59e0b'}; font-size: 12px;">${statusText}</td>
          </tr>`;
      }
    }
  }

  const reasonSection = reason
    ? `<p style="font-size: 16px; background: #f8fafc; padding: 12px 16px; border-left: 4px solid #FF6B00; margin: 20px 0;"><strong>Note:</strong> ${reason}</p>`
    : '';

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

        <p style="font-size: 16px;">This is a schedule update for the installation project at <strong>${propertyName}</strong>${locationName ? ` — ${locationName}` : ''}.</p>

        <div style="background: #fff7ed; border: 2px solid #FF6B00; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Estimated Completion Date</p>
          <p style="margin: 0; font-size: 14px;">
            <span style="color: #999; text-decoration: line-through;">${formatDate(oldDate)}</span>
            <span style="color: #666; margin: 0 8px;">→</span>
            <span style="color: #FF6B00; font-weight: bold; font-size: 18px;">${formatDate(newDate)}</span>
          </p>
        </div>

        ${reasonSection}

        ${taskStatusHtml ? `
        <p style="font-size: 16px; margin-top: 24px;"><strong>Current Task Status:</strong></p>
        <div style="background: #f9f9f9; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            ${taskStatusHtml}
          </table>
        </div>
        ` : ''}

        <p style="text-align: center; margin: 30px 0;">
          <a href="${projectUrl}" style="background: #FF6B00; color: white; padding: 14px 36px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; font-size: 16px;">View Project Portal</a>
        </p>

        <p style="font-size: 16px; color: #666;">Please don't hesitate to reach out if you have any questions.</p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

        <p style="font-size: 14px; color: #666; margin: 0;">
          <strong>Raptor Vending</strong><br />
          Project: ${projectNumber}<br />
          <a href="mailto:info@raptor-vending.com" style="color: #FF6B00;">info@raptor-vending.com</a>
        </p>
      </div>

      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>Raptor Vending Installation Portal</p>
      </div>
    </body>
    </html>
  `;
}

export async function POST(request: NextRequest) {
  // Admin auth required
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!MAILGUN_API_KEY) {
    return NextResponse.json({ error: 'Mailgun API key not configured' }, { status: 500 });
  }

  // Parse request body
  let body: {
    projectId: string;
    pm_email: string;
    pm_name: string;
    cc_emails: string;
    old_date: string | null;
    new_date: string;
    reason?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { projectId, pm_email, pm_name, cc_emails, old_date, new_date, reason } = body;

  if (!projectId || !pm_email || !new_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Fetch project with phases and tasks
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        public_token,
        project_number,
        location:locations (
          name,
          property:properties (
            name
          )
        ),
        phases (
          title,
          status,
          phase_number,
          tasks (
            label,
            completed,
            sort_order
          )
        )
      `)
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Handle Supabase nested relations (returns as object with .single())
    const locationData = project.location as unknown as { name: string; property: { name: string } | null } | null;
    const propertyName = locationData?.property?.name || locationData?.name || project.project_number;
    const locationName = locationData?.name || '';
    const projectUrl = `${PORTAL_URL}/project/${project.public_token}`;
    const pmFirstName = (pm_name || '').split(' ')[0] || '';

    // Sort phases by phase_number
    const phases = ((project.phases || []) as Array<{ title: string; status: string; phase_number: number; tasks: Task[] }>)
      .sort((a, b) => (a.phase_number || 0) - (b.phase_number || 0))
      .map(p => ({
        title: p.title,
        status: p.status,
        tasks: (p.tasks || []).sort((a: Task & { sort_order?: number }, b: Task & { sort_order?: number }) =>
          (a.sort_order || 0) - (b.sort_order || 0)
        ),
      }));

    // Generate and send email
    const subject = `Schedule Update — ${propertyName} Project ${project.project_number}`;
    const html = generateDateChangeEmail(
      pmFirstName,
      propertyName,
      locationName,
      project.project_number || '',
      old_date,
      new_date,
      reason || null,
      phases,
      projectUrl
    );

    await sendEmail(pm_email, subject, html, cc_emails, projectId);

    // Log to activity stream
    await supabase
      .from('activity_log')
      .insert({
        project_id: projectId,
        action: 'date_change_notification',
        description: `Schedule update sent to ${pm_name} (${pm_email}): ${formatDate(old_date)} → ${formatDate(new_date)}${reason ? ` — ${reason}` : ''}`,
        actor_type: 'system',
      });

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${pm_name} (${pm_email})`,
      to: pm_email,
      cc: cc_emails,
    });
  } catch (error) {
    console.error('Date change notification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send notification' },
      { status: 500 }
    );
  }
}
