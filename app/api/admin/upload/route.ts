import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';

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

  const contentType = request.headers.get('content-type') || '';

  try {
    let bucket: string;
    let filePath: string;
    let fileBuffer: Buffer;
    let mimeType: string;

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const folder = formData.get('folder') as string || 'uploads';

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      // Determine bucket based on folder
      bucket = 'inventory'; // Default bucket for inventory-related uploads

      // Generate unique filename
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const ext = file.name.split('.').pop() || 'jpg';
      filePath = `${folder}/${timestamp}-${randomStr}.${ext}`;

      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      mimeType = file.type || 'image/jpeg';

    } else {
      // Handle JSON upload (legacy base64 format)
      const body = await request.json();
      const { bucket: reqBucket, filePath: reqPath, fileData, contentType: reqContentType } = body;

      if (!reqBucket || !reqPath || !fileData) {
        return NextResponse.json({ error: 'Missing required fields: bucket, filePath, fileData' }, { status: 400 });
      }

      bucket = reqBucket;
      filePath = reqPath;
      fileBuffer = Buffer.from(fileData, 'base64');
      mimeType = reqContentType || 'application/octet-stream';
    }

    console.log(`[Upload] Uploading to bucket: ${bucket}, path: ${filePath}, size: ${fileBuffer.length} bytes, type: ${mimeType}`);

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      console.error('[Upload] Storage upload error:', uploadError);
      // Check if bucket doesn't exist
      if (uploadError.message.includes('not found') || uploadError.message.includes('does not exist') || uploadError.message.includes('Bucket')) {
        return NextResponse.json({
          error: `Storage bucket "${bucket}" not found or not accessible.`,
          hint: 'Create bucket in Supabase > Storage > New bucket > Name: inventory > Public: Yes'
        }, { status: 500 });
      }
      // Check for policy errors
      if (uploadError.message.includes('policy') || uploadError.message.includes('permission') || uploadError.message.includes('row-level')) {
        return NextResponse.json({
          error: 'Storage permission denied.',
          hint: 'The bucket exists but needs proper policies. Check Supabase Storage policies.'
        }, { status: 500 });
      }
      return NextResponse.json({
        error: uploadError.message,
        details: JSON.stringify(uploadError)
      }, { status: 500 });
    }

    console.log('[Upload] Success:', uploadData);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      publicUrl: urlData.publicUrl, // Include both for compatibility
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}
