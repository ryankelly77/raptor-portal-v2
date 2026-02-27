// Survey tracking functions
// Client-side functions for recording survey interactions

/**
 * Record a survey link click
 */
export async function recordSurveyClick(surveyToken: string): Promise<boolean> {
  const response = await fetch('/api/survey-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ surveyToken, action: 'click' }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to record survey click');
  }

  return true;
}

/**
 * Record a survey completion
 */
export async function recordSurveyCompletion(surveyToken: string): Promise<boolean> {
  const response = await fetch('/api/survey-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ surveyToken, action: 'complete' }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to record survey completion');
  }

  return true;
}

/**
 * Get project by survey token (server-side only)
 */
export async function getProjectBySurveyToken(surveyToken: string): Promise<{
  id: string;
  project_number: string;
  survey_clicks: number;
} | null> {
  // This function should be called from a Server Component or API route
  // It uses the admin client to fetch the project
  const { getAdminClient } = await import('@/lib/supabase/admin');
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, project_number, survey_clicks')
    .eq('survey_token', surveyToken)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw error;
  }

  return data as { id: string; project_number: string; survey_clicks: number };
}
