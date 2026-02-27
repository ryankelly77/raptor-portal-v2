import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

interface SurveyTrackRequest {
  surveyToken: string;
  action: 'click' | 'complete';
}

export async function POST(request: NextRequest) {
  let body: SurveyTrackRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { surveyToken, action } = body;

  if (!surveyToken) {
    return NextResponse.json({ error: 'Survey token is required' }, { status: 400 });
  }

  if (!action || !['click', 'complete'].includes(action)) {
    return NextResponse.json({ error: 'Valid action required: click or complete' }, { status: 400 });
  }

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  try {
    // Get current project by survey token
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('id, survey_clicks, survey_completions')
      .eq('survey_token', surveyToken)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    // Update the appropriate counter
    const updateData: Record<string, number> = {};
    if (action === 'click') {
      updateData.survey_clicks = ((project.survey_clicks as number) || 0) + 1;
    } else if (action === 'complete') {
      updateData.survey_completions = ((project.survey_completions as number) || 0) + 1;
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', project.id);

    if (updateError) {
      console.error('Survey track update error:', updateError.message);
      return NextResponse.json({ error: 'Failed to update survey tracking' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Survey track error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
