import { NextRequest, NextResponse } from 'next/server';
import { requireDriver, DriverTokenPayload } from '@/lib/auth/jwt';
import { getAdminClient } from '@/lib/supabase/admin';

interface TempLogRequest {
  action: string;
  data?: Record<string, unknown>;
  id?: string;
}

export async function POST(request: NextRequest) {
  // Authenticate driver
  const auth = requireDriver(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const driverId = (auth.payload as DriverTokenPayload).driverId;

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  let body: TempLogRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, data, id } = body;

  try {
    switch (action) {
      // SESSION OPERATIONS

      case 'getActiveSession': {
        const { data: session, error } = await supabase
          .from('temp_log_sessions')
          .select(`
            *,
            entries:temp_log_entries(*)
          `)
          .eq('driver_id', driverId)
          .eq('status', 'in_progress')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        // Sort entries by timestamp
        if (session?.entries) {
          session.entries.sort((a: { timestamp: string }, b: { timestamp: string }) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        }

        return NextResponse.json({ session: session || null });
      }

      case 'createSession': {
        const vehicleId = data?.vehicleId as string | undefined;
        const notes = data?.notes as string | undefined;

        const { data: session, error } = await supabase
          .from('temp_log_sessions')
          .insert({
            driver_id: driverId,
            vehicle_id: vehicleId || null,
            notes: notes || null,
            status: 'in_progress',
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`[Temp Log] Session created: ${session.id} by driver ${driverId}`);
        return NextResponse.json({ session }, { status: 201 });
      }

      case 'completeSession': {
        if (!id) {
          return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
        }

        // Verify ownership
        const { data: existing } = await supabase
          .from('temp_log_sessions')
          .select('id, driver_id')
          .eq('id', id)
          .single();

        if (!existing || existing.driver_id !== driverId) {
          return NextResponse.json({ error: 'Not authorized to modify this session' }, { status: 403 });
        }

        const { data: session, error } = await supabase
          .from('temp_log_sessions')
          .update({ status: 'completed' })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        console.log(`[Temp Log] Session completed: ${id}`);
        return NextResponse.json({ session });
      }

      case 'getSessionHistory': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: sessions, error } = await supabase
          .from('temp_log_sessions')
          .select(`
            *,
            entries:temp_log_entries(count)
          `)
          .eq('driver_id', driverId)
          .gte('session_date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ sessions });
      }

      // ENTRY OPERATIONS

      case 'addEntry': {
        const sessionId = data?.sessionId as string | undefined;
        const entryType = data?.entryType as string | undefined;
        const temperature = data?.temperature as number | undefined;
        const locationName = data?.locationName as string | undefined;
        const photoUrl = data?.photoUrl as string | undefined;
        const notes = data?.notes as string | undefined;
        let stopNumber = data?.stopNumber as number | undefined;

        if (!sessionId || !entryType || temperature === undefined) {
          return NextResponse.json({ error: 'sessionId, entryType, and temperature are required' }, { status: 400 });
        }

        if (!['pickup', 'delivery'].includes(entryType)) {
          return NextResponse.json({ error: 'entryType must be pickup or delivery' }, { status: 400 });
        }

        // Verify session ownership
        const { data: session } = await supabase
          .from('temp_log_sessions')
          .select('id, driver_id, status')
          .eq('id', sessionId)
          .single();

        if (!session || session.driver_id !== driverId) {
          return NextResponse.json({ error: 'Not authorized to add entries to this session' }, { status: 403 });
        }

        if (session.status !== 'in_progress') {
          return NextResponse.json({ error: 'Cannot add entries to a completed session' }, { status: 400 });
        }

        // Get next stop number if not provided
        if (!stopNumber && entryType === 'delivery') {
          const { data: lastEntry } = await supabase
            .from('temp_log_entries')
            .select('stop_number')
            .eq('session_id', sessionId)
            .eq('entry_type', 'delivery')
            .order('stop_number', { ascending: false })
            .limit(1)
            .single();

          stopNumber = lastEntry ? (lastEntry.stop_number as number) + 1 : 1;
        }

        const { data: entry, error } = await supabase
          .from('temp_log_entries')
          .insert({
            session_id: sessionId,
            entry_type: entryType,
            stop_number: entryType === 'pickup' ? 0 : stopNumber,
            location_name: locationName || null,
            temperature: parseFloat(String(temperature)),
            photo_url: photoUrl || null,
            notes: notes || null,
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`[Temp Log] Entry added: ${entryType} at ${temperature}°F for session ${sessionId}`);
        return NextResponse.json({ entry }, { status: 201 });
      }

      case 'updateEntry': {
        const entryId = data?.entryId as string | undefined;
        const temperature = data?.temperature as number | undefined;
        const photoUrl = data?.photoUrl as string | undefined;
        const notes = data?.notes as string | undefined;
        const locationName = data?.locationName as string | undefined;

        if (!entryId) {
          return NextResponse.json({ error: 'entryId required' }, { status: 400 });
        }

        // Verify ownership through session
        const { data: entry } = await supabase
          .from('temp_log_entries')
          .select(`
            id,
            session:temp_log_sessions(driver_id, status)
          `)
          .eq('id', entryId)
          .single();

        const entrySession = entry?.session as unknown as { driver_id: string; status: string } | null;

        if (!entry || entrySession?.driver_id !== driverId) {
          return NextResponse.json({ error: 'Not authorized to modify this entry' }, { status: 403 });
        }

        if (entrySession?.status !== 'in_progress') {
          return NextResponse.json({ error: 'Cannot modify entries in a completed session' }, { status: 400 });
        }

        const updateData: Record<string, unknown> = {};
        if (temperature !== undefined) updateData.temperature = parseFloat(String(temperature));
        if (photoUrl !== undefined) updateData.photo_url = photoUrl;
        if (notes !== undefined) updateData.notes = notes;
        if (locationName !== undefined) updateData.location_name = locationName;

        const { data: updated, error } = await supabase
          .from('temp_log_entries')
          .update(updateData)
          .eq('id', entryId)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ entry: updated });
      }

      case 'deleteEntry': {
        const entryId = data?.entryId as string | undefined;

        if (!entryId) {
          return NextResponse.json({ error: 'entryId required' }, { status: 400 });
        }

        // Verify ownership through session
        const { data: entry } = await supabase
          .from('temp_log_entries')
          .select(`
            id,
            session:temp_log_sessions(driver_id, status)
          `)
          .eq('id', entryId)
          .single();

        const entrySession = entry?.session as unknown as { driver_id: string; status: string } | null;

        if (!entry || entrySession?.driver_id !== driverId) {
          return NextResponse.json({ error: 'Not authorized to delete this entry' }, { status: 403 });
        }

        if (entrySession?.status !== 'in_progress') {
          return NextResponse.json({ error: 'Cannot delete entries from a completed session' }, { status: 400 });
        }

        const { error } = await supabase
          .from('temp_log_entries')
          .delete()
          .eq('id', entryId);

        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({
          error: 'Invalid action',
          validActions: [
            'getActiveSession',
            'createSession',
            'completeSession',
            'getSessionHistory',
            'addEntry',
            'updateEntry',
            'deleteEntry',
          ],
        }, { status: 400 });
    }
  } catch (error) {
    console.error(`[Temp Log] Error in ${action}:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
