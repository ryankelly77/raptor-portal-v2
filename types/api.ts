// API types for Raptor Portal

export type CrudAction = 'create' | 'read' | 'update' | 'delete' | 'list';

export type CrudTable =
  | 'property_managers'
  | 'properties'
  | 'locations'
  | 'projects'
  | 'phases'
  | 'tasks'
  | 'drivers'
  | 'temp_log_sessions'
  | 'temp_log_entries'
  | 'activity_logs'
  | 'pm_messages'
  | 'global_documents'
  | 'email_templates';

export interface CrudRequest<T = Record<string, unknown>> {
  action: CrudAction;
  table: CrudTable;
  id?: string;
  data?: T;
  filters?: Record<string, unknown>;
  orderBy?: {
    column: string;
    ascending?: boolean;
  };
  limit?: number;
  offset?: number;
}

export interface CrudResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  error?: string;
  expiresAt?: string;
}

export interface AdminLoginRequest {
  password: string;
}

export interface DriverLoginRequest {
  email: string;
  accessToken: string;
}

export interface PMLoginRequest {
  accessToken: string;
}

// API route response types
export interface ProjectResponse {
  success: boolean;
  project?: import('./database').ProjectWithRelations;
  error?: string;
}

export interface ProjectsResponse {
  success: boolean;
  projects?: import('./database').ProjectWithRelations[];
  error?: string;
}

export interface TaskUpdateRequest {
  taskId: string;
  updates: import('./database').TaskUpdate;
}

export interface PhaseUpdateRequest {
  phaseId: string;
  updates: import('./database').PhaseUpdate;
}

// Webhook payloads
export interface HighLevelWebhookPayload {
  type: string;
  locationId: string;
  contactId?: string;
  data?: Record<string, unknown>;
}

// Email sending
export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Cron job responses
export interface CronResponse {
  success: boolean;
  message?: string;
  processed?: number;
  errors?: string[];
}
