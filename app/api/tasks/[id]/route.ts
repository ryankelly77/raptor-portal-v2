import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Calculate overall project progress based on completed tasks
 */
async function recalculateProjectProgress(
  supabase: ReturnType<typeof getAdminClient>,
  projectId: string
): Promise<number> {
  // Get all phases for this project
  const { data: phases, error: phasesError } = await supabase
    .from('phases')
    .select('id')
    .eq('project_id', projectId);

  if (phasesError || !phases || phases.length === 0) return 0;

  // Get all tasks for all phases
  const phaseIds = phases.map(p => p.id);
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('completed')
    .in('phase_id', phaseIds);

  if (tasksError || !tasks) return 0;

  // Calculate progress
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const newProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Update project overall_progress
  await supabase
    .from('projects')
    .update({ overall_progress: newProgress })
    .eq('id', projectId);

  return newProgress;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const updates = await request.json();
    const supabase = getAdminClient();

    // Update the task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 400 });
    }

    // Get the phase to find the project_id
    const { data: phase } = await supabase
      .from('phases')
      .select('project_id')
      .eq('id', task.phase_id)
      .single();

    let newProgress: number | null = null;

    if (phase?.project_id) {
      // Get all tasks for this phase to update phase status
      const { data: phaseTasks } = await supabase
        .from('tasks')
        .select('completed')
        .eq('phase_id', task.phase_id);

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
          .eq('id', task.phase_id);
      }

      // Recalculate project overall_progress
      newProgress = await recalculateProjectProgress(supabase, phase.project_id);

      // Log activity if task was just completed
      if (updates.completed === true) {
        const taskLabel = (task.label as string)
          .replace('[PM] ', '')
          .replace('[PM-TEXT] ', '')
          .replace('[PM-DATE] ', '');

        await supabase.from('activity_log').insert({
          project_id: phase.project_id,
          task_id: id,
          action: 'task_completed',
          description: taskLabel,
          actor_type: 'property_manager',
        });
      }
    }

    return NextResponse.json({
      task,
      newProgress,
      success: true
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
