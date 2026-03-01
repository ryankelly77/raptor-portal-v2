// Task update functions for PM-facing task completion
// Uses API route with admin client for proper permissions

import type { Task, TaskUpdate } from '@/types/database';

export interface UpdateTaskOptions {
  skipLog?: boolean;
  actorType?: 'admin' | 'property_manager' | 'system';
}

/**
 * Update a task via API route
 * This ensures proper permissions for updating phase status and project progress
 */
export async function updateTask(
  id: string,
  updates: TaskUpdate,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: UpdateTaskOptions = {}
): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update task');
  }

  const result = await response.json();
  return result.task as Task;
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
