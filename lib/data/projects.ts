// Server-side data fetching functions for projects
// Use in Server Components only

import { getAdminClient } from '@/lib/supabase/admin';
import { formatDisplayDate, calculateDaysRemaining } from '@/lib/dates';

// Types for assembled project views
export interface ProjectManagerInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface PropertyManagerInfo {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}

export interface ContractorInfo {
  name: string;
  scheduledDate: string | null;
  status: string | null;
}

export interface SurveyResults {
  responseRate: number;
  topMeals: string[];
  topSnacks: string[];
  dietaryNotes: string | null;
}

export interface PhaseDocument {
  url: string;
  label: string;
}

export interface DeliveryInfo {
  equipment: string;
  date?: string;
  carrier?: string;
  tracking?: string;
}

export interface TaskView {
  id: string;
  label: string;
  completed: boolean;
  scheduled_date: string | null;
  upload_speed: string | null;
  download_speed: string | null;
  enclosure_type: string | null;
  enclosure_color: string | null;
  custom_color_name: string | null;
  smartfridge_qty: number | null;
  smartcooker_qty: number | null;
  delivery_carrier: string | null;
  tracking_number: string | null;
  deliveries: DeliveryInfo[] | null;
  document_url: string | null;
  pm_text_value: string | null;
}

export interface PhaseView {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  isApproximate: boolean;
  propertyResponsibility: string | null;
  contractorInfo: ContractorInfo | null;
  surveyResults: SurveyResults | null;
  document: PhaseDocument | null;
  documents: PhaseDocument[];
  tasks: TaskView[];
}

export interface EquipmentView {
  id: string;
  name: string;
  model: string | null;
  spec: string | null;
  status: string | null;
  statusLabel: string | null;
}

export interface GlobalDocumentMap {
  [key: string]: {
    key: string;
    label: string;
    url: string;
    description: string | null;
  };
}

export interface ProjectView {
  id: string;
  projectId: string;
  publicToken: string;
  locationName: string;
  locationFloor: string;
  locationImages: string[];
  propertyName: string;
  address: string;
  employeeCount: number;
  configuration: unknown;
  projectManager: ProjectManagerInfo;
  propertyManager: PropertyManagerInfo | null;
  estimatedCompletion: string;
  daysRemaining: number | null;
  overallProgress: number | null;
  surveyToken: string | null;
  surveyClicks: number;
  surveyCompletions: number;
  phases: PhaseView[];
  equipment: EquipmentView[];
  globalDocuments: GlobalDocumentMap;
}

export interface PMPortalProperty {
  id: string;
  name: string;
  address: string;
  totalEmployees: number;
  locationCount: number;
}

export interface PMPortalData {
  propertyManager: {
    id: string;
    name: string;
    email: string | null;
    company: string | null;
  };
  properties: PMPortalProperty[];
  projects: ProjectView[];
}

/**
 * Fetch a single project by public token with all related data
 */
export async function fetchProjectByToken(token: string): Promise<ProjectView | null> {
  const supabase = getAdminClient();

  // Get project with location and property info
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(`
      *,
      location:locations(
        *,
        property:properties(
          *,
          property_manager:property_managers(*)
        )
      )
    `)
    .eq('public_token', token)
    .eq('is_active', true)
    .single();

  if (projectError) throw projectError;
  if (!project) return null;

  // Fetch phases
  const { data: phases, error: phasesError } = await supabase
    .from('phases')
    .select('*')
    .eq('project_id', project.id)
    .order('phase_number', { ascending: true });

  if (phasesError) throw phasesError;

  // Fetch tasks for all phases
  const phaseIds = (phases || []).map(p => p.id);
  let tasks: Array<Record<string, unknown>> = [];
  if (phaseIds.length > 0) {
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .in('phase_id', phaseIds)
      .order('sort_order', { ascending: true });

    if (tasksError) throw tasksError;
    tasks = tasksData || [];

    // Debug: Log all task labels to see PM tasks
    const pmTasks = tasks.filter(t => (t.label as string)?.startsWith('[PM]'));
    if (pmTasks.length > 0) {
      console.log('[SERVER DEBUG] PM Tasks found:', pmTasks.map(t => ({ id: t.id, label: t.label, phase_id: t.phase_id })));
    }
    console.log('[SERVER DEBUG] Total tasks fetched:', tasks.length, 'PM tasks:', pmTasks.length);
  }

  // Fetch equipment
  const { data: equipment, error: equipmentError } = await supabase
    .from('equipment')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order', { ascending: true });

  if (equipmentError) throw equipmentError;

  // Fetch global documents
  const { data: globalDocs } = await supabase
    .from('global_documents')
    .select('*');

  const globalDocsMap: GlobalDocumentMap = {};
  (globalDocs || []).forEach(doc => {
    globalDocsMap[doc.key as string] = {
      key: doc.key as string,
      label: doc.label as string,
      url: doc.url as string,
      description: doc.description as string | null,
    };
  });

  // Assemble the full project object
  const location = project.location as unknown as {
    name: string;
    floor: string | null;
    images: string[] | null;
    property: {
      name: string;
      address: string;
      city: string;
      state: string;
      zip: string;
      total_employees: number;
      property_manager: {
        id: string;
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
      } | null;
    } | null;
  } | null;

  const property = location?.property;
  const propertyManager = property?.property_manager;

  const phasesWithTasks: PhaseView[] = (phases || []).map(phase => ({
    id: phase.id as string,
    title: phase.title as string,
    status: phase.status as string,
    startDate: phase.start_date as string | null,
    endDate: phase.end_date as string | null,
    description: phase.description as string | null,
    isApproximate: phase.is_approximate as boolean,
    propertyResponsibility: phase.property_responsibility as string | null,
    contractorInfo: phase.contractor_name ? {
      name: phase.contractor_name as string,
      scheduledDate: phase.contractor_scheduled_date as string | null,
      status: phase.contractor_status as string | null,
    } : null,
    surveyResults: phase.survey_response_rate ? {
      responseRate: phase.survey_response_rate as number,
      topMeals: (phase.survey_top_meals as string[]) || [],
      topSnacks: (phase.survey_top_snacks as string[]) || [],
      dietaryNotes: phase.survey_dietary_notes as string | null,
    } : null,
    document: phase.document_url ? {
      url: phase.document_url as string,
      label: (phase.document_label as string) || 'View Document',
    } : null,
    documents: (phase.documents as PhaseDocument[]) || [],
    tasks: tasks
      .filter(t => t.phase_id === phase.id)
      .map(t => ({
        id: t.id as string,
        label: t.label as string,
        completed: t.completed as boolean,
        scheduled_date: t.scheduled_date as string | null,
        upload_speed: t.upload_speed as string | null,
        download_speed: t.download_speed as string | null,
        enclosure_type: t.enclosure_type as string | null,
        enclosure_color: t.enclosure_color as string | null,
        custom_color_name: t.custom_color_name as string | null,
        smartfridge_qty: t.smartfridge_qty as number | null,
        smartcooker_qty: t.smartcooker_qty as number | null,
        delivery_carrier: t.delivery_carrier as string | null,
        tracking_number: t.tracking_number as string | null,
        deliveries: t.deliveries as DeliveryInfo[] | null,
        document_url: t.document_url as string | null,
        pm_text_value: t.pm_text_value as string | null,
      })),
  }));

  return {
    id: project.project_number as string,
    projectId: project.id as string,
    publicToken: project.public_token as string,
    locationName: location?.name || '',
    locationFloor: location?.floor || '',
    locationImages: location?.images || [],
    propertyName: property?.name || '',
    address: property ? `${property.address}, ${property.city}, ${property.state} ${property.zip}` : '',
    employeeCount: property?.total_employees || 0,
    configuration: project.configuration,
    projectManager: {
      name: project.raptor_pm_name as string | null,
      email: project.raptor_pm_email as string | null,
      phone: project.raptor_pm_phone as string | null,
    },
    propertyManager: propertyManager ? {
      id: propertyManager.id,
      name: propertyManager.name,
      company: propertyManager.company,
      email: propertyManager.email,
      phone: propertyManager.phone,
    } : null,
    estimatedCompletion: formatDisplayDate(project.estimated_completion as string | null),
    daysRemaining: calculateDaysRemaining(project.estimated_completion as string | null),
    overallProgress: project.overall_progress as number | null,
    surveyToken: project.survey_token as string | null,
    surveyClicks: (project.survey_clicks as number) || 0,
    surveyCompletions: (project.survey_completions as number) || 0,
    phases: phasesWithTasks,
    equipment: (equipment || []).map(e => ({
      id: e.id as string,
      name: e.name as string,
      model: e.model as string | null,
      spec: e.spec as string | null,
      status: e.status as string | null,
      statusLabel: e.status_label as string | null,
    })),
    globalDocuments: globalDocsMap,
  };
}

/**
 * Fetch all projects for a property manager by their access token
 */
export async function fetchProjectsByPMToken(accessToken: string): Promise<PMPortalData | null> {
  const supabase = getAdminClient();

  // Get property manager
  const { data: pm, error: pmError } = await supabase
    .from('property_managers')
    .select('*')
    .eq('access_token', accessToken)
    .eq('is_active', true)
    .single();

  if (pmError) throw pmError;
  if (!pm) return null;

  // Get all properties for this PM
  const { data: properties, error: propError } = await supabase
    .from('properties')
    .select(`
      *,
      locations(
        *,
        projects(*)
      )
    `)
    .eq('property_manager_id', pm.id)
    .order('name', { ascending: true });

  if (propError) throw propError;

  // Fetch full project data for each project
  const allProjects: ProjectView[] = [];
  for (const property of properties || []) {
    const locations = property.locations as unknown as Array<{
      projects: Array<{ is_active: boolean; public_token: string }>;
    }>;
    for (const location of locations || []) {
      for (const project of location.projects || []) {
        if (project.is_active) {
          const fullProject = await fetchProjectByToken(project.public_token);
          if (fullProject) {
            allProjects.push(fullProject);
          }
        }
      }
    }
  }

  return {
    propertyManager: {
      id: pm.id as string,
      name: pm.name as string,
      email: pm.email as string | null,
      company: pm.company as string | null,
    },
    properties: (properties || []).map(p => ({
      id: p.id as string,
      name: p.name as string,
      address: `${p.address}, ${p.city}, ${p.state} ${p.zip}`,
      totalEmployees: (p.total_employees as number) || 0,
      locationCount: ((p.locations as unknown[]) || []).length,
    })),
    projects: allProjects,
  };
}
