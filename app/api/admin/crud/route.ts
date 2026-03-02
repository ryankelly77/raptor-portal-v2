import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getAdminClient } from '@/lib/supabase/admin';
import { isValidId, isNonEmptyString, isValidEmail } from '@/lib/validators';

// Table configuration
interface TableConfig {
  allowedFields: string[];
  requiredForCreate: string[];
  orderBy: { column: string; ascending: boolean };
}

const TABLE_CONFIG: Record<string, TableConfig> = {
  projects: {
    allowedFields: [
      'property_id', 'location_id', 'name', 'status', 'description',
      'target_install_date', 'actual_install_date', 'notes',
      'property_manager_id', 'project_number', 'public_token', 'is_active',
      'overall_progress', 'estimated_completion', 'configuration',
      'employee_count', 'email_reminders_enabled', 'reminder_email',
      'last_reminder_sent', 'survey_clicks', 'survey_completions',
      'survey_token', 'raptor_pm_name', 'raptor_pm_email', 'raptor_pm_phone',
    ],
    requiredForCreate: ['property_id', 'name'],
    orderBy: { column: 'created_at', ascending: false },
  },
  phases: {
    allowedFields: [
      'project_id', 'title', 'phase_number', 'status', 'description',
      'start_date', 'end_date', 'is_approximate',
      'property_responsibility', 'contractor_name',
      'contractor_scheduled_date', 'contractor_status',
      'survey_response_rate', 'survey_top_meals',
      'survey_top_snacks', 'survey_dietary_notes',
      'document_url', 'document_label', 'documents',
    ],
    requiredForCreate: ['project_id', 'title'],
    orderBy: { column: 'phase_number', ascending: true },
  },
  tasks: {
    allowedFields: [
      'phase_id', 'label', 'completed', 'sort_order', 'scheduled_date',
      'upload_speed', 'download_speed', 'enclosure_type',
      'enclosure_color', 'custom_color_name', 'smartfridge_qty',
      'smartcooker_qty', 'deliveries', 'document_url', 'notes',
      'pm_text_response', 'pm_text_value',
    ],
    requiredForCreate: ['phase_id', 'label'],
    orderBy: { column: 'sort_order', ascending: true },
  },
  property_managers: {
    allowedFields: [
      'name', 'email', 'phone', 'company', 'is_active', 'access_token', 'notes',
    ],
    requiredForCreate: ['name'],
    orderBy: { column: 'name', ascending: true },
  },
  properties: {
    allowedFields: [
      'name', 'property_manager_id', 'address', 'city', 'state', 'zip',
      'total_employees', 'notes',
    ],
    requiredForCreate: ['name'],
    orderBy: { column: 'name', ascending: true },
  },
  locations: {
    allowedFields: [
      'name', 'property_id', 'floor', 'employee_count', 'images', 'notes',
    ],
    requiredForCreate: ['name', 'property_id'],
    orderBy: { column: 'name', ascending: true },
  },
  pm_messages: {
    allowedFields: [
      'pm_id', 'sender', 'sender_name', 'message', 'read_at',
    ],
    requiredForCreate: ['pm_id', 'message'],
    orderBy: { column: 'created_at', ascending: false },
  },
  global_documents: {
    allowedFields: [
      'key', 'label', 'description', 'url', 'file_type',
    ],
    requiredForCreate: ['key', 'label'],
    orderBy: { column: 'label', ascending: true },
  },
  email_templates: {
    allowedFields: [
      'key', 'name', 'subject', 'body', 'description', 'is_active',
    ],
    requiredForCreate: ['key', 'name'],
    orderBy: { column: 'name', ascending: true },
  },
  messages: {
    allowedFields: [
      'project_id', 'sender_type', 'sender_name', 'message', 'is_read',
    ],
    requiredForCreate: ['project_id', 'message'],
    orderBy: { column: 'created_at', ascending: false },
  },
  migrations: {
    allowedFields: [
      'name', 'version', 'description', 'status', 'executed_at',
    ],
    requiredForCreate: ['name', 'version'],
    orderBy: { column: 'version', ascending: true },
  },
  drivers: {
    allowedFields: [
      'name', 'email', 'phone', 'is_active', 'access_token',
    ],
    requiredForCreate: ['name'],
    orderBy: { column: 'name', ascending: true },
  },
  temp_log_sessions: {
    allowedFields: [
      'driver_id', 'session_date', 'vehicle_id', 'notes', 'status',
    ],
    requiredForCreate: ['driver_id'],
    orderBy: { column: 'created_at', ascending: false },
  },
  temp_log_entries: {
    allowedFields: [
      'session_id', 'entry_type', 'stop_number', 'location_name',
      'timestamp', 'temperature', 'photo_url', 'notes',
    ],
    requiredForCreate: ['session_id', 'entry_type', 'temperature'],
    orderBy: { column: 'timestamp', ascending: true },
  },
  equipment: {
    allowedFields: [
      'project_id', 'name', 'model', 'spec', 'status', 'status_label', 'sort_order',
    ],
    requiredForCreate: ['project_id', 'name'],
    orderBy: { column: 'sort_order', ascending: true },
  },
  activity_log: {
    allowedFields: [
      'project_id', 'phase_id', 'task_id', 'action', 'description',
      'performed_by', 'actor_type', 'metadata',
    ],
    requiredForCreate: ['action', 'description'],
    orderBy: { column: 'created_at', ascending: false },
  },
  // Inventory tables
  products: {
    allowedFields: [
      'barcode', 'name', 'brand', 'category', 'default_price', 'image_url', 'is_active',
    ],
    requiredForCreate: ['barcode', 'name', 'category'],
    orderBy: { column: 'name', ascending: true },
  },
  inventory_purchases: {
    allowedFields: [
      'purchased_by', 'store_name', 'purchase_date', 'receipt_image_url',
      'receipt_total', 'status',
    ],
    requiredForCreate: ['purchased_by'],
    orderBy: { column: 'created_at', ascending: false },
  },
  inventory_purchase_items: {
    allowedFields: [
      'purchase_id', 'product_id', 'quantity', 'unit_cost',
    ],
    requiredForCreate: ['purchase_id', 'product_id'],
    orderBy: { column: 'created_at', ascending: false },
  },
  inventory_movements: {
    allowedFields: [
      'product_id', 'location_id', 'quantity', 'movement_type', 'reason',
      'reference_id', 'moved_by', 'notes',
    ],
    requiredForCreate: ['product_id', 'quantity', 'movement_type'],
    orderBy: { column: 'created_at', ascending: false },
  },
  sales_imports: {
    allowedFields: [
      'location_id', 'file_url', 'import_date', 'records_count', 'status',
    ],
    requiredForCreate: ['location_id'],
    orderBy: { column: 'created_at', ascending: false },
  },
  receipt_aliases: {
    allowedFields: [
      'store_name', 'receipt_text', 'product_id',
    ],
    requiredForCreate: ['receipt_text', 'product_id'],
    orderBy: { column: 'receipt_text', ascending: true },
  },
};

// Generate random token for projects
function generateToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Sanitize fields based on table config
function sanitizeFields(table: string, fields: Record<string, unknown>): Record<string, unknown> {
  const config = TABLE_CONFIG[table];
  if (!config) return {};

  const sanitized: Record<string, unknown> = {};
  for (const key of config.allowedFields) {
    if (fields[key] !== undefined) {
      sanitized[key] = fields[key];
    }
  }
  return sanitized;
}

// Validate required fields for create
function validateRequiredFields(table: string, data: Record<string, unknown>): { valid: boolean; error?: string } {
  const config = TABLE_CONFIG[table];
  if (!config) return { valid: false, error: 'Unknown table' };

  for (const field of config.requiredForCreate) {
    if (field.endsWith('_id')) {
      if (!isValidId(data[field])) {
        return { valid: false, error: `Valid ${field} is required` };
      }
    } else {
      if (!isNonEmptyString(data[field])) {
        return { valid: false, error: `${field} is required` };
      }
    }
  }
  return { valid: true };
}

// Handle migrations (one-time data fixes)
async function handleMigration(
  migrationName: string,
  supabase: ReturnType<typeof getAdminClient>
): Promise<NextResponse> {
  switch (migrationName) {
    case 'add-banner-task': {
      const { data: phases, error: phasesError } = await supabase
        .from('phases')
        .select('id, project_id, title')
        .eq('phase_number', 3);

      if (phasesError) throw phasesError;

      const newTaskLabel = '[PM-TEXT] Allow Raptor Vending to place retractable banners on site announcing the food program until machines arrive';
      let added = 0;
      let skipped = 0;

      for (const phase of phases || []) {
        const { data: existingTasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, label')
          .eq('phase_id', phase.id)
          .ilike('label', '%retractable banners%');

        if (tasksError) throw tasksError;

        if (existingTasks && existingTasks.length > 0) {
          skipped++;
          continue;
        }

        const { data: tasksToShift } = await supabase
          .from('tasks')
          .select('id, sort_order')
          .eq('phase_id', phase.id)
          .gte('sort_order', 2)
          .order('sort_order', { ascending: false });

        if (tasksToShift) {
          for (const task of tasksToShift) {
            await supabase
              .from('tasks')
              .update({ sort_order: (task.sort_order as number) + 1 })
              .eq('id', task.id);
          }
        }

        const { error: insertError } = await supabase
          .from('tasks')
          .insert({
            phase_id: phase.id,
            label: newTaskLabel,
            completed: false,
            sort_order: 2,
          });

        if (insertError) {
          console.error(`Failed to add task to phase ${phase.id}:`, insertError);
        } else {
          added++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Added banner task to ${added} phases, skipped ${skipped} (already had it)`,
        total_phases: phases?.length || 0,
      });
    }

    case 'add-enclosure-confirm-task': {
      const { data: phases, error: phasesError } = await supabase
        .from('phases')
        .select('id, project_id, title')
        .eq('phase_number', 6);

      if (phasesError) throw phasesError;

      const newTaskLabel = '[PM] I confirm the enclosure configuration and optional colors';
      let added = 0;
      let skipped = 0;

      for (const phase of phases || []) {
        const { data: existingTasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, label')
          .eq('phase_id', phase.id)
          .ilike('label', '%confirm the enclosure%');

        if (tasksError) throw tasksError;

        if (existingTasks && existingTasks.length > 0) {
          skipped++;
          continue;
        }

        const { data: tasksToShift } = await supabase
          .from('tasks')
          .select('id, sort_order')
          .eq('phase_id', phase.id)
          .gte('sort_order', 3)
          .order('sort_order', { ascending: false });

        if (tasksToShift) {
          for (const task of tasksToShift) {
            await supabase
              .from('tasks')
              .update({ sort_order: (task.sort_order as number) + 1 })
              .eq('id', task.id);
          }
        }

        const { error: insertError } = await supabase
          .from('tasks')
          .insert({
            phase_id: phase.id,
            label: newTaskLabel,
            completed: false,
            sort_order: 3,
          });

        if (insertError) {
          console.error(`Failed to add task to phase ${phase.id}:`, insertError);
        } else {
          added++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Added enclosure confirm task to ${added} phases, skipped ${skipped} (already had it)`,
        total_phases: phases?.length || 0,
      });
    }

    default:
      return NextResponse.json({ error: 'Unknown migration: ' + migrationName }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  // JWT verification
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No authorization token' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    jwt.verify(token, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // Get Supabase admin client
  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error('Supabase admin client error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 });
  }

  // Parse request
  let body: {
    table?: string;
    action?: string;
    data?: Record<string, unknown>;
    id?: string;
    filters?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { table, action, data, id, filters } = body;
  console.log('[CRUD REQUEST]', JSON.stringify({ table, action, id, filters, dataKeys: data ? Object.keys(data) : null }));

  // Validate action
  const validActions = ['create', 'read', 'update', 'delete', 'migrate'];
  if (!action || !validActions.includes(action)) {
    return NextResponse.json({
      error: 'Invalid action. Allowed: ' + validActions.join(', '),
    }, { status: 400 });
  }

  // Handle migrations (special action, table param is migration name)
  if (action === 'migrate') {
    if (!table) {
      return NextResponse.json({ error: 'Migration name required' }, { status: 400 });
    }
    return handleMigration(table, supabase);
  }

  // Validate table (only for non-migrate actions)
  if (!table || !TABLE_CONFIG[table]) {
    return NextResponse.json({
      error: 'Invalid table. Allowed: ' + Object.keys(TABLE_CONFIG).join(', '),
    }, { status: 400 });
  }

  const config = TABLE_CONFIG[table];

  try {
    switch (action) {
      case 'read': {
        // Read single by ID or list with optional filters
        if (id) {
          if (!isValidId(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
          }
          const { data: record, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', id)
            .single();

          if (error) throw error;
          return NextResponse.json({ data: record });
        }

        // List with optional filters
        let query = supabase.from(table).select('*');

        // Apply filters (e.g., { project_id: 123 })
        if (filters && typeof filters === 'object') {
          for (const [key, value] of Object.entries(filters)) {
            if (config.allowedFields.includes(key) || key === 'id') {
              query = query.eq(key, value);
            }
          }
        }

        // Apply default ordering
        if (config.orderBy) {
          query = query.order(config.orderBy.column, { ascending: config.orderBy.ascending });
        }

        const { data: records, error } = await query;
        if (error) throw error;
        return NextResponse.json({ data: records });
      }

      case 'create': {
        if (!data || typeof data !== 'object') {
          return NextResponse.json({ error: 'Data object is required for create' }, { status: 400 });
        }

        // Validate required fields
        const validation = validateRequiredFields(table, data);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        // Email validation for tables with email field
        if (data.email && !isValidEmail(data.email)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        // Sanitize and prepare insert data
        const insertData: Record<string, unknown> = sanitizeFields(table, data);

        // Table-specific defaults
        if (table === 'projects') {
          insertData.public_token = insertData.public_token || generateToken();
          insertData.is_active = insertData.is_active !== false;
        } else if (table === 'phases') {
          insertData.phase_number = insertData.phase_number || 1;
          insertData.status = insertData.status || 'not_started';
        } else if (table === 'tasks') {
          insertData.completed = insertData.completed || false;
          insertData.sort_order = insertData.sort_order || 0;
        } else if (table === 'property_managers') {
          insertData.is_active = insertData.is_active !== false;
        } else if (table === 'drivers') {
          insertData.is_active = insertData.is_active !== false;
        } else if (table === 'temp_log_sessions') {
          insertData.status = insertData.status || 'in_progress';
        } else if (table === 'temp_log_entries') {
          insertData.stop_number = insertData.stop_number || 1;
        }

        console.log(`[CRUD CREATE] Table: ${table}, Data:`, JSON.stringify(insertData));
        const { data: created, error } = await supabase
          .from(table)
          .insert([insertData])
          .select()
          .single();

        if (error) {
          console.error(`[CRUD CREATE ERROR] Table: ${table}, Error:`, error.message, 'Data:', JSON.stringify(insertData));
          throw error;
        }
        return NextResponse.json({ data: created }, { status: 201 });
      }

      case 'update': {
        if (!isValidId(id)) {
          return NextResponse.json({ error: 'Valid ID is required for update' }, { status: 400 });
        }

        if (!data || typeof data !== 'object') {
          return NextResponse.json({ error: 'Data object is required for update' }, { status: 400 });
        }

        // Email validation if updating email
        if (data.email && !isValidEmail(data.email)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        const updateData = {
          ...sanitizeFields(table, data),
          updated_at: new Date().toISOString(),
        };

        const { data: updated, error } = await supabase
          .from(table)
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ data: updated });
      }

      case 'delete': {
        if (!isValidId(id)) {
          return NextResponse.json({ error: 'Valid ID is required for delete' }, { status: 400 });
        }

        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    console.error(`Admin CRUD error [${table}/${action}]:`, {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
      requestData: JSON.stringify({ table, action, id, data: data ? Object.keys(data) : null }),
    });
    return NextResponse.json({
      error: err.message,
      details: err.details || null,
      hint: err.hint || null,
    }, { status: 500 });
  }
}
