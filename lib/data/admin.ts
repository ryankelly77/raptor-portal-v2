// Server-side admin data fetching functions
// Use in Server Components only

import { getAdminClient } from '@/lib/supabase/admin';
import type {
  PropertyManager,
  Property,
  Location,
  Project,
  Phase,
  Task,
  GlobalDocument,
} from '@/types/database';

export interface AdminDashboardData {
  propertyManagers: PropertyManager[];
  properties: Property[];
  locations: Location[];
  projects: Project[];
  globalDocuments: GlobalDocument[];
}

export interface PhaseWithTasks extends Phase {
  tasks: Task[];
}

export interface ProjectDetails {
  phases: PhaseWithTasks[];
  equipment: Array<{
    id: string;
    name: string;
    model: string | null;
    spec: string | null;
    status: string | null;
    status_label: string | null;
    sort_order: number;
  }>;
}

export interface ActivityLogEntry {
  id: string;
  project_id: string | null;
  task_id: string | null;
  action: string;
  description: string;
  actor_type: string | null;
  created_at: string;
  project: {
    project_number: string;
    location: {
      name: string;
      property: {
        name: string;
      } | null;
    } | null;
  } | null;
}

/**
 * Fetch all data for admin dashboard (parallel fetch)
 */
export async function fetchAllForAdmin(): Promise<AdminDashboardData> {
  const supabase = getAdminClient();

  const [pmResult, propResult, locResult, projResult, docsResult] = await Promise.all([
    supabase.from('property_managers').select('*').order('name'),
    supabase.from('properties').select('*').order('name'),
    supabase.from('locations').select('*').order('name'),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('global_documents').select('*').order('label'),
  ]);

  return {
    propertyManagers: (pmResult.data || []) as unknown as PropertyManager[],
    properties: (propResult.data || []) as unknown as Property[],
    locations: (locResult.data || []) as unknown as Location[],
    projects: (projResult.data || []) as unknown as Project[],
    globalDocuments: (docsResult.data || []) as unknown as GlobalDocument[],
  };
}

/**
 * Fetch phases and tasks for a project (admin detail view)
 */
export async function fetchProjectDetails(projectId: string): Promise<ProjectDetails> {
  const supabase = getAdminClient();

  const [phasesResult, equipmentResult] = await Promise.all([
    supabase
      .from('phases')
      .select('*')
      .eq('project_id', projectId)
      .order('phase_number'),
    supabase
      .from('equipment')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order'),
  ]);

  const phases = phasesResult.data || [];
  const phaseIds = phases.map(p => p.id);

  let tasks: Array<Record<string, unknown>> = [];
  if (phaseIds.length > 0) {
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .in('phase_id', phaseIds)
      .order('sort_order');
    tasks = tasksData || [];
  }

  return {
    phases: phases.map(phase => ({
      ...(phase as unknown as Phase),
      tasks: tasks.filter(t => t.phase_id === phase.id) as unknown as Task[],
    })),
    equipment: (equipmentResult.data || []).map(e => ({
      id: e.id as string,
      name: e.name as string,
      model: e.model as string | null,
      spec: e.spec as string | null,
      status: e.status as string | null,
      status_label: e.status_label as string | null,
      sort_order: e.sort_order as number,
    })),
  };
}

/**
 * Fetch activity log with project/location/property joins
 */
export async function fetchActivityLog(projectId?: string): Promise<ActivityLogEntry[]> {
  const supabase = getAdminClient();

  let query = supabase
    .from('activity_log')
    .select(`
      *,
      project:projects(project_number, location:locations(name, property:properties(name)))
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as unknown as ActivityLogEntry[];
}
