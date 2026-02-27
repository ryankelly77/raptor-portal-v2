// Task update functions for PM-facing task completion
//
// TODO: This currently uses the browser Supabase client with anon key for direct
// database access. For better security, this should be moved to an API route
// that validates the PM's access token before allowing task updates.
// The current implementation relies on RLS policies for security.

import { createClient } from '@/lib/supabase/client';
import type { Task, TaskUpdate } from '@/types/database';

export interface UpdateTaskOptions {
  skipLog?: boolean;
  actorType?: 'admin' | 'property_manager' | 'system';
}

/**
 * Update a task and auto-update the parent phase status
 * Also logs activity for task completions
 */
export async function updateTask(
  id: string,
  updates: TaskUpdate,
  options: UpdateTaskOptions = {}
): Promise<Task> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Auto-update phase status based on task completion
  if (data && data.phase_id) {
    try {
      // Get all tasks for this phase and the phase info
      const [{ data: phaseTasks }, { data: phase }] = await Promise.all([
        supabase.from('tasks').select('completed').eq('phase_id', data.phase_id),
        supabase.from('phases').select('project_id').eq('id', data.phase_id).single(),
      ]);

      if (phaseTasks && phaseTasks.length > 0) {
        const completedCount = phaseTasks.filter(t => t.completed).length;
        let newStatus: string;
        if (completedCount === 0) {
          newStatus = 'pending';
        } else if (completedCount === phaseTasks.length) {
          newStatus = 'completed';
        } else {
          newStatus = 'in-progress';
        }

        // Update phase status
        await supabase
          .from('phases')
          .update({ status: newStatus })
          .eq('id', data.phase_id);
      }

      // Log activity if task was just completed and not from admin
      if (updates.completed === true && !options.skipLog && phase?.project_id) {
        const taskLabel = (data.label as string)
          .replace('[PM] ', '')
          .replace('[PM-TEXT] ', '')
          .replace('[PM-DATE] ', '');

        await supabase.from('activity_log').insert({
          project_id: phase.project_id,
          task_id: id,
          action: 'task_completed',
          description: taskLabel,
          actor_type: options.actorType || 'property_manager',
        });
      }
    } catch (statusErr) {
      console.error('Error auto-updating phase status:', statusErr);
    }
  }

  return data as unknown as Task;
}

/**
 * Batch update multiple tasks
 */
export async function updateTasks(
  taskUpdates: Array<{ id: string; updates: TaskUpdate }>,
  options: UpdateTaskOptions = {}
): Promise<Task[]> {
  const results: Task[] = [];
  for (const { id, updates } of taskUpdates) {
    const result = await updateTask(id, updates, options);
    results.push(result);
  }
  return results;
}
