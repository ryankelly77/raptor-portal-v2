import { NextResponse } from 'next/server';
import { fetchProjectsByPMToken } from '@/lib/data/projects';

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;

  try {
    const data = await fetchProjectsByPMToken(token);

    if (!data) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching PM portal data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
