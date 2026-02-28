import { NextResponse } from 'next/server';
import { fetchProjectByToken } from '@/lib/data/projects';

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;

  try {
    const data = await fetchProjectByToken(token);

    if (!data) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching project data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
