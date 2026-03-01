'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './templates.module.css';

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Default template configurations
const TEMPLATE_CONFIGS = [
  {
    key: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to {{property_name}}!',
    body: `Hello {{pm_name}},

Welcome to the Raptor Vending Installation Portal. Your portal is now ready to use.

Property: {{property_name}}
Location: {{location_name}}

You can access your portal anytime at:
{{portal_url}}

Best regards,
The Raptor Vending Team`,
    variables: ['pm_name', 'property_name', 'location_name', 'portal_url'],
  },
  {
    key: 'project_created',
    name: 'Project Created',
    subject: 'New Project: {{property_name}} - {{location_name}}',
    body: `Hello {{pm_name}},

A new installation project has been created for your property.

Property: {{property_name}}
Location: {{location_name}}
Project #: {{project_number}}

View your project status at:
{{portal_url}}

Best regards,
The Raptor Vending Team`,
    variables: ['pm_name', 'property_name', 'location_name', 'project_number', 'portal_url'],
  },
  {
    key: 'phase_completed',
    name: 'Phase Completed',
    subject: '{{phase_name}} Complete - {{property_name}}',
    body: `Hello {{pm_name}},

Great news! The "{{phase_name}}" phase has been completed for your project.

Property: {{property_name}}
Location: {{location_name}}
Completed Phase: {{phase_name}}
Next Phase: {{next_phase_name}}

View the full project status at:
{{portal_url}}

Best regards,
The Raptor Vending Team`,
    variables: ['pm_name', 'property_name', 'location_name', 'phase_name', 'next_phase_name', 'portal_url'],
  },
  {
    key: 'project_completed',
    name: 'Project Completed',
    subject: 'Installation Complete - {{property_name}}',
    body: `Hello {{pm_name}},

Congratulations! Your installation project has been completed.

Property: {{property_name}}
Location: {{location_name}}
Project #: {{project_number}}

Thank you for choosing Raptor Vending. If you have any questions or need support, please don't hesitate to reach out.

Best regards,
The Raptor Vending Team`,
    variables: ['pm_name', 'property_name', 'location_name', 'project_number'],
  },
  {
    key: 'action_required',
    name: 'Action Required',
    subject: 'Action Required: {{task_name}} - {{property_name}}',
    body: `Hello {{pm_name}},

We need your input on a project task.

Property: {{property_name}}
Location: {{location_name}}
Task: {{task_name}}

Please visit your portal to complete this action:
{{portal_url}}

Best regards,
The Raptor Vending Team`,
    variables: ['pm_name', 'property_name', 'location_name', 'task_name', 'portal_url'],
  },
  {
    key: 'reminder',
    name: 'Reminder',
    subject: 'Reminder: {{subject_line}}',
    body: `Hello {{pm_name}},

This is a friendly reminder regarding your installation project.

{{reminder_message}}

Property: {{property_name}}
Location: {{location_name}}

Best regards,
The Raptor Vending Team`,
    variables: ['pm_name', 'property_name', 'location_name', 'subject_line', 'reminder_message'],
  },
];

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', subject: '', body: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'email_templates', action: 'read' }),
      });
      const result = await response.json();
      setTemplates(result.data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function getTemplate(key: string): EmailTemplate | null {
    return templates.find((t) => t.key === key) || null;
  }

  function getConfig(key: string) {
    return TEMPLATE_CONFIGS.find((c) => c.key === key);
  }

  async function handleCreate(config: (typeof TEMPLATE_CONFIGS)[0]) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'create',
          data: {
            key: config.key,
            name: config.name,
            subject: config.subject,
            body: config.body,
            is_active: true,
          },
        }),
      });
      await loadTemplates();
    } catch (err) {
      alert('Error creating template: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleSave(id: string) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'update',
          id,
          data: {
            name: editForm.name,
            subject: editForm.subject,
            body: editForm.body,
            is_active: editForm.is_active,
          },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadTemplates();
    } catch (err) {
      alert('Error saving template: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(template: EmailTemplate) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'update',
          id: template.id,
          data: { is_active: !template.is_active },
        }),
      });
      await loadTemplates();
    } catch (err) {
      alert('Error updating template: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleReset(key: string) {
    const config = getConfig(key);
    const template = getTemplate(key);
    if (!config || !template) return;

    if (!window.confirm('Reset this template to default? All customizations will be lost.')) return;

    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'update',
          id: template.id,
          data: {
            name: config.name,
            subject: config.subject,
            body: config.body,
          },
        }),
      });
      setEditForm({
        name: config.name,
        subject: config.subject,
        body: config.body,
        is_active: template.is_active,
      });
      await loadTemplates();
    } catch (err) {
      alert('Error resetting template: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  function expandTemplate(key: string) {
    const template = getTemplate(key);
    const config = getConfig(key);

    if (expandedTemplate === key) {
      setExpandedTemplate(null);
      return;
    }

    setExpandedTemplate(key);
    setShowPreview(false);

    if (template) {
      setEditForm({
        name: template.name,
        subject: template.subject,
        body: template.body,
        is_active: template.is_active,
      });
    } else if (config) {
      setEditForm({
        name: config.name,
        subject: config.subject,
        body: config.body,
        is_active: true,
      });
    }
  }

  function insertVariable(variable: string) {
    setEditForm({ ...editForm, body: editForm.body + `{{${variable}}}` });
  }

  function getPreviewText(text: string) {
    // Replace variables with sample values
    const sampleValues: Record<string, string> = {
      pm_name: 'John Smith',
      property_name: 'Sunrise Apartments',
      location_name: 'Building A - Lobby',
      project_number: 'PRJ-2024-001',
      portal_url: 'https://portal.raptorvendingusa.com/pm/abc123',
      phase_name: 'Equipment Installation',
      next_phase_name: 'Testing & Calibration',
      task_name: 'Approve Equipment Specs',
      subject_line: 'Upcoming Installation',
      reminder_message: 'Please remember to clear the installation area before our team arrives.',
    };

    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleValues[key] || `{{${key}}}`);
  }

  if (loading) {
    return (
      <AdminShell title="Email Templates">
        <div className={styles.templatesPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Email Templates">
      <div className={styles.templatesPage}>
        <div className={styles.pageHeader}>
          <p className={styles.pageDescription}>
            Customize automated email notifications sent to property managers
          </p>
      </div>

      <div className={styles.templatesList}>
        {TEMPLATE_CONFIGS.map((config) => {
          const template = getTemplate(config.key);
          const isExpanded = expandedTemplate === config.key;

          return (
            <div key={config.key} className={styles.templateCard}>
              <div className={styles.templateHeader} onClick={() => expandTemplate(config.key)}>
                <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>▶</span>
                <div className={styles.templateInfo}>
                  <span className={styles.templateKey}>{config.key}</span>
                  <h3 className={styles.templateName}>{template?.name || config.name}</h3>
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.statusBadge} ${template?.is_active !== false ? styles.active : styles.inactive}`}>
                    {template?.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                  {!template && <span style={{ color: '#9ca3af', fontSize: '12px' }}>Not initialized</span>}
                </div>
              </div>

              {isExpanded && (
                <div className={styles.templateContent}>
                  {!template ? (
                    <div>
                      <p style={{ color: '#6b7280', marginBottom: '16px' }}>
                        This template hasn&apos;t been initialized yet. Click below to create it with default content.
                      </p>
                      <button className={styles.btnPrimary} onClick={() => handleCreate(config)}>
                        Initialize Template
                      </button>
                    </div>
                  ) : (
                    <div className={styles.editorForm}>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Template Name</label>
                        <input
                          className={styles.formInput}
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Subject Line</label>
                        <input
                          className={styles.formInput}
                          value={editForm.subject}
                          onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Email Body</label>
                        <textarea
                          className={styles.formTextarea}
                          value={editForm.body}
                          onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                          rows={10}
                        />
                      </div>

                      <div className={styles.variablesSection}>
                        <h4 className={styles.variablesTitle}>Available Variables (click to insert)</h4>
                        <div className={styles.variablesList}>
                          {config.variables.map((variable) => (
                            <button
                              key={variable}
                              className={styles.variableTag}
                              onClick={() => insertVariable(variable)}
                            >
                              {`{{${variable}}}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.previewSection}>
                        <div className={styles.previewTitle}>
                          <span>Preview</span>
                          <button className={styles.previewToggle} onClick={() => setShowPreview(!showPreview)}>
                            {showPreview ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {showPreview && (
                          <div className={styles.previewBox}>
                            <p className={styles.previewSubject}>Subject: {getPreviewText(editForm.subject)}</p>
                            <div className={styles.previewBody}>{getPreviewText(editForm.body)}</div>
                          </div>
                        )}
                      </div>

                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={editForm.is_active}
                          onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        />
                        Template is active
                      </label>

                      <div className={styles.formActions}>
                        <button
                          className={styles.btnPrimary}
                          onClick={() => handleSave(template.id)}
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => handleReset(config.key)}>
                          Reset to Default
                        </button>
                        <button className={styles.btnDanger} onClick={() => handleToggleActive(template)}>
                          {template.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </AdminShell>
  );
}
