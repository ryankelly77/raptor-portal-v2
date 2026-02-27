// Database types for Raptor Portal
// Generated from supabase-schema.sql and migrations

export interface PropertyManager {
  id: string;
  access_token: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_manager_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  property_id: string;
  name: string;
  floor: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';

export interface Project {
  id: string;
  property_id: string;
  location_id: string | null;
  name: string;
  status: ProjectStatus;
  description: string | null;
  target_install_date: string | null;
  actual_install_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  property_manager_id: string | null;
}

export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface Phase {
  id: string;
  project_id: string;
  title: string;
  phase_number: number;
  status: PhaseStatus;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_approximate: boolean;
  property_responsibility: string | null;
  contractor_name: string | null;
  contractor_scheduled_date: string | null;
  contractor_status: string | null;
  survey_response_rate: number | null;
  survey_top_meals: string | null;
  survey_top_snacks: string | null;
  survey_dietary_notes: string | null;
  document_url: string | null;
  document_label: string | null;
  documents: PhaseDocument[];
  created_at: string;
  updated_at: string;
}

export interface PhaseDocument {
  url: string;
  label: string;
  uploaded_at?: string;
}

export type TaskPrefix =
  | '[PM]'
  | '[PM-TEXT]'
  | '[PM-DATE]'
  | '[ADMIN-DATE]'
  | '[ADMIN-SPEED]'
  | '[ADMIN-ENCLOSURE]'
  | '[ADMIN-EQUIPMENT]'
  | '[ADMIN-DELIVERY]'
  | '[ADMIN-DOC]';

export interface Task {
  id: string;
  phase_id: string;
  label: string;
  completed: boolean;
  sort_order: number;
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
  deliveries: unknown[] | null;
  document_url: string | null;
  pm_text_value: string | null;
  pm_text_response: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EquipmentStatus = 'pending' | 'fabricating' | 'ready' | 'in-transit' | 'delivered' | 'installed';

export interface Equipment {
  id: string;
  project_id: string;
  name: string;
  model: string | null;
  spec: string | null;
  status: EquipmentStatus;
  status_label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  access_token: string;
  created_at: string;
  updated_at: string;
}

export interface TempLogSession {
  id: string;
  driver_id: string;
  project_id: string;
  vehicle_id: string | null;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TempLogEntry {
  id: string;
  session_id: string;
  timestamp: string;
  temperature: number;
  location: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

export type ActivityLogAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed'
  | 'task_completed'
  | 'task_uncompleted'
  | 'document_uploaded'
  | 'comment_added';

export interface ActivityLog {
  id: string;
  project_id: string | null;
  phase_id: string | null;
  task_id: string | null;
  action: ActivityLogAction;
  description: string;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PmMessage {
  id: string;
  project_id: string;
  sender_type: 'admin' | 'pm';
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface GlobalDocument {
  id: string;
  label: string;
  url: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Extended types with relations
export interface ProjectWithRelations extends Project {
  property?: Property;
  property_manager?: PropertyManager;
  location?: Location;
  phases?: PhaseWithTasks[];
}

export interface PhaseWithTasks extends Phase {
  tasks?: Task[];
}

export interface PropertyWithLocations extends Property {
  locations?: Location[];
  property_manager?: PropertyManager;
}

// Insert types (for creating new records)
export type PropertyManagerInsert = Omit<PropertyManager, 'id' | 'created_at' | 'updated_at'>;
export type PropertyInsert = Omit<Property, 'id' | 'created_at' | 'updated_at'>;
export type LocationInsert = Omit<Location, 'id' | 'created_at' | 'updated_at'>;
export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at'>;
export type PhaseInsert = Omit<Phase, 'id' | 'created_at' | 'updated_at'>;
export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at'>;
export type EquipmentInsert = Omit<Equipment, 'id' | 'created_at' | 'updated_at'>;
export type DriverInsert = Omit<Driver, 'id' | 'created_at' | 'updated_at'>;
export type GlobalDocumentInsert = Omit<GlobalDocument, 'id' | 'created_at' | 'updated_at'>;
export type EmailTemplateInsert = Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>;

// Update types (all fields optional except id)
export type PropertyManagerUpdate = Partial<Omit<PropertyManager, 'id' | 'created_at' | 'updated_at'>>;
export type PropertyUpdate = Partial<Omit<Property, 'id' | 'created_at' | 'updated_at'>>;
export type LocationUpdate = Partial<Omit<Location, 'id' | 'created_at' | 'updated_at'>>;
export type ProjectUpdate = Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>;
export type PhaseUpdate = Partial<Omit<Phase, 'id' | 'created_at' | 'updated_at'>>;
export type TaskUpdate = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>;
export type EquipmentUpdate = Partial<Omit<Equipment, 'id' | 'created_at' | 'updated_at'>>;
export type DriverUpdate = Partial<Omit<Driver, 'id' | 'created_at' | 'updated_at'>>;
export type GlobalDocumentUpdate = Partial<Omit<GlobalDocument, 'id' | 'created_at' | 'updated_at'>>;
export type EmailTemplateUpdate = Partial<Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>>;
