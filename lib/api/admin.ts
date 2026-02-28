// Client-side Admin API client for authenticated CRUD operations
// Uses consolidated /api/admin/crud endpoint
// Use in Client Components only ('use client')

import type {
  PropertyManager,
  Property,
  Location,
  Project,
  Phase,
  Task,
  GlobalDocument,
  EmailTemplate,
  PropertyManagerInsert,
  PropertyManagerUpdate,
  PropertyInsert,
  PropertyUpdate,
  LocationInsert,
  LocationUpdate,
  ProjectInsert,
  ProjectUpdate,
  PhaseInsert,
  PhaseUpdate,
  TaskInsert,
  TaskUpdate,
  GlobalDocumentUpdate,
  EmailTemplateUpdate,
} from '@/types/database';
import type { CrudAction, CrudTable } from '@/types/api';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  console.log('[CLIENT] Token from sessionStorage:', token ? `${token.substring(0, 30)}...` : 'NULL');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  console.log('[CLIENT] Response status:', response.status);
  const data = await response.json();
  console.log('[CLIENT] Response data:', JSON.stringify(data).substring(0, 200));

  if (!response.ok) {
    if (response.status === 401) {
      console.error('[CLIENT] !!!! 401 ERROR !!!!');
      console.error('[CLIENT] Response body:', JSON.stringify(data, null, 2));
      console.error('[CLIENT] DO NOT REDIRECT - check console now');
      // TEMPORARILY DISABLED REDIRECT FOR DEBUGGING
      // sessionStorage.clear();
      // window.location.href = '/admin';
      throw new Error('Session expired - check console for details');
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

interface CrudOptions {
  id?: string;
  data?: Record<string, unknown>;
  filters?: Record<string, unknown>;
}

interface CrudResult<T> {
  data?: T;
  success?: boolean;
}

// Generic CRUD helper
async function adminCrud<T>(
  table: CrudTable,
  action: CrudAction,
  options: CrudOptions = {}
): Promise<CrudResult<T>> {
  const { id, data, filters } = options;
  console.log('[CLIENT] Calling /api/admin/crud:', { table, action });
  const headers = getAuthHeaders();
  console.log('[CLIENT] Headers being sent:', JSON.stringify(headers));
  const response = await fetch('/api/admin/crud', {
    method: 'POST',
    headers,
    body: JSON.stringify({ table, action, id, data, filters }),
  });
  return handleResponse<CrudResult<T>>(response);
}

// ============================================
// PROJECTS API
// ============================================

export async function fetchProjects(): Promise<Project[]> {
  const result = await adminCrud<Project[]>('projects', 'read');
  return result.data || [];
}

export async function fetchProject(id: string): Promise<Project | null> {
  const result = await adminCrud<Project>('projects', 'read', { id });
  return result.data || null;
}

export async function createProject(data: ProjectInsert): Promise<Project> {
  const result = await adminCrud<Project>('projects', 'create', { data: data as Record<string, unknown> });
  return result.data!;
}

export async function updateProject(id: string, updates: ProjectUpdate): Promise<Project> {
  const result = await adminCrud<Project>('projects', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deleteProject(id: string): Promise<boolean> {
  await adminCrud('projects', 'delete', { id });
  return true;
}

// ============================================
// PHASES API
// ============================================

export async function fetchPhases(projectId: string): Promise<Phase[]> {
  const result = await adminCrud<Phase[]>('phases', 'read', { filters: { project_id: projectId } });
  return result.data || [];
}

export async function fetchPhase(id: string): Promise<Phase | null> {
  const result = await adminCrud<Phase>('phases', 'read', { id });
  return result.data || null;
}

export async function createPhase(data: PhaseInsert): Promise<Phase> {
  const result = await adminCrud<Phase>('phases', 'create', { data: data as Record<string, unknown> });
  return result.data!;
}

export async function updatePhase(id: string, updates: PhaseUpdate): Promise<Phase> {
  const result = await adminCrud<Phase>('phases', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deletePhase(id: string): Promise<boolean> {
  await adminCrud('phases', 'delete', { id });
  return true;
}

// ============================================
// TASKS API
// ============================================

export async function fetchTasks(phaseId: string): Promise<Task[]> {
  const result = await adminCrud<Task[]>('tasks', 'read', { filters: { phase_id: phaseId } });
  return result.data || [];
}

export async function fetchTask(id: string): Promise<Task | null> {
  const result = await adminCrud<Task>('tasks', 'read', { id });
  return result.data || null;
}

export async function createTask(data: TaskInsert): Promise<Task> {
  const result = await adminCrud<Task>('tasks', 'create', { data: data as Record<string, unknown> });
  return result.data!;
}

export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const result = await adminCrud<Task>('tasks', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deleteTask(id: string): Promise<boolean> {
  await adminCrud('tasks', 'delete', { id });
  return true;
}

// ============================================
// PROPERTY MANAGERS API
// ============================================

export async function fetchPropertyManagers(): Promise<PropertyManager[]> {
  const result = await adminCrud<PropertyManager[]>('property_managers', 'read');
  return result.data || [];
}

export async function fetchPropertyManager(id: string): Promise<PropertyManager | null> {
  const result = await adminCrud<PropertyManager>('property_managers', 'read', { id });
  return result.data || null;
}

export async function createPropertyManager(data: PropertyManagerInsert): Promise<PropertyManager> {
  const result = await adminCrud<PropertyManager>('property_managers', 'create', { data: data as Record<string, unknown> });
  return result.data!;
}

export async function updatePropertyManager(id: string, updates: PropertyManagerUpdate): Promise<PropertyManager> {
  const result = await adminCrud<PropertyManager>('property_managers', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deletePropertyManager(id: string): Promise<boolean> {
  await adminCrud('property_managers', 'delete', { id });
  return true;
}

// ============================================
// PROPERTIES API
// ============================================

export async function fetchProperties(): Promise<Property[]> {
  const result = await adminCrud<Property[]>('properties', 'read');
  return result.data || [];
}

export async function fetchProperty(id: string): Promise<Property | null> {
  const result = await adminCrud<Property>('properties', 'read', { id });
  return result.data || null;
}

export async function fetchPropertiesByManager(propertyManagerId: string): Promise<Property[]> {
  const result = await adminCrud<Property[]>('properties', 'read', { filters: { property_manager_id: propertyManagerId } });
  return result.data || [];
}

export async function createProperty(data: PropertyInsert): Promise<Property> {
  const result = await adminCrud<Property>('properties', 'create', { data: data as Record<string, unknown> });
  return result.data!;
}

export async function updateProperty(id: string, updates: PropertyUpdate): Promise<Property> {
  const result = await adminCrud<Property>('properties', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deleteProperty(id: string): Promise<boolean> {
  await adminCrud('properties', 'delete', { id });
  return true;
}

// ============================================
// LOCATIONS API
// ============================================

export async function fetchLocations(): Promise<Location[]> {
  const result = await adminCrud<Location[]>('locations', 'read');
  return result.data || [];
}

export async function fetchLocation(id: string): Promise<Location | null> {
  const result = await adminCrud<Location>('locations', 'read', { id });
  return result.data || null;
}

export async function fetchLocationsByProperty(propertyId: string): Promise<Location[]> {
  const result = await adminCrud<Location[]>('locations', 'read', { filters: { property_id: propertyId } });
  return result.data || [];
}

export async function createLocation(data: LocationInsert): Promise<Location> {
  const result = await adminCrud<Location>('locations', 'create', { data: data as Record<string, unknown> });
  return result.data!;
}

export async function updateLocation(id: string, updates: LocationUpdate): Promise<Location> {
  const result = await adminCrud<Location>('locations', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deleteLocation(id: string): Promise<boolean> {
  await adminCrud('locations', 'delete', { id });
  return true;
}

// ============================================
// PM MESSAGES API
// ============================================

interface PmMessage {
  id: string;
  pm_id: string;
  sender: string;
  sender_name: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export async function fetchAllPmMessages(): Promise<PmMessage[]> {
  const result = await adminCrud<PmMessage[]>('pm_messages', 'read');
  return result.data || [];
}

export async function fetchPmMessagesByPm(pmId: string): Promise<PmMessage[]> {
  const result = await adminCrud<PmMessage[]>('pm_messages', 'read', { filters: { pm_id: pmId } });
  return result.data || [];
}

export async function createPmMessage(data: { pm_id: string; sender: string; sender_name: string; message: string }): Promise<PmMessage> {
  const result = await adminCrud<PmMessage>('pm_messages', 'create', { data });
  return result.data!;
}

export async function updatePmMessage(id: string, updates: Partial<PmMessage>): Promise<PmMessage> {
  const result = await adminCrud<PmMessage>('pm_messages', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

export async function deletePmMessage(id: string): Promise<boolean> {
  await adminCrud('pm_messages', 'delete', { id });
  return true;
}

export async function markPmMessagesAsRead(pmId: string): Promise<boolean> {
  const messages = await fetchPmMessagesByPm(pmId);
  const now = new Date().toISOString();
  for (const msg of messages) {
    if (msg.sender === 'pm' && !msg.read_at) {
      await adminCrud('pm_messages', 'update', { id: msg.id, data: { read_at: now } });
    }
  }
  return true;
}

// ============================================
// GLOBAL DOCUMENTS API
// ============================================

export async function fetchGlobalDocuments(): Promise<GlobalDocument[]> {
  const result = await adminCrud<GlobalDocument[]>('global_documents', 'read');
  return result.data || [];
}

export async function updateGlobalDocument(id: string, updates: GlobalDocumentUpdate): Promise<GlobalDocument> {
  const result = await adminCrud<GlobalDocument>('global_documents', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

// ============================================
// EMAIL TEMPLATES API
// ============================================

export async function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  const result = await adminCrud<EmailTemplate[]>('email_templates', 'read');
  return result.data || [];
}

export async function updateEmailTemplate(id: string, updates: EmailTemplateUpdate): Promise<EmailTemplate> {
  const result = await adminCrud<EmailTemplate>('email_templates', 'update', { id, data: updates as Record<string, unknown> });
  return result.data!;
}

// ============================================
// FILE UPLOAD API
// ============================================

export async function uploadFile(bucket: string, filePath: string, file: File): Promise<string> {
  // Convert file to base64
  const fileData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1]; // Remove data:...;base64, prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      bucket,
      filePath,
      fileData,
      contentType: file.type,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        window.location.href = '/admin';
      }
      throw new Error('Session expired');
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data.publicUrl;
}

// ============================================
// MIGRATIONS API
// ============================================

export async function runMigration(migrationName: string): Promise<{ success: boolean; message?: string }> {
  const response = await fetch('/api/admin/crud', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ table: migrationName, action: 'migrate' }),
  });
  return handleResponse(response);
}
