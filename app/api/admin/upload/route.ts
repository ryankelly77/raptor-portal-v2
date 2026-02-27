import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';

interface UploadRequest {
  bucket: string;
  filePath: string;
  fileData: string; // base64
  contentType?: string;
}

export async function POST(request: NextRequest) {
  // Admin authentication
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  // Get Supabase admin client
  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  let body: UploadRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { bucket, filePath, fileData, contentType } = body;

  if (!bucket || !filePath || !fileData) {
    return NextResponse.json({ error: 'Missing required fields: bucket, filePath, fileData' }, { status: 400 });
  }

  try {
    // Convert base64 to buffer
    const fileBuffer = Buffer.from(fileData, 'base64');

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        upsert: true,
        contentType: contentType || 'application/octet-stream',
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}
