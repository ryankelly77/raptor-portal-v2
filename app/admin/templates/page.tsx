'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './templates.module.css';

interface EmailTemplate {
  id: string;
  name: string;
  trigger_description: string | null;
  trigger_details: string | null;
  recipients: string | null;
  cc_emails: string | null;
  subject_template: string | null;
  body_template: string | null;
  created_at: string;
  updated_at: string;
}

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
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    trigger_description: '',
    trigger_details: '',
    recipients: '',
    cc_emails: '',
    subject_template: '',
    body_template: '',
  });
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    trigger_description: '',
    trigger_details: '',
    recipients: '',
    cc_emails: '',
    subject_template: '',
    body_template: '',
  });

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'email_templates', action: 'read' }),
      });
      const result = await response.json();
      console.log('Email templates from database:', result);
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

  function handleExpand(templateId: string) {
    if (expandedTemplate === templateId) {
      setExpandedTemplate(null);
      setEditingTemplate(null);
    } else {
      setExpandedTemplate(templateId);
      setEditingTemplate(null);
    }
  }

  function handleEdit(template: EmailTemplate) {
    setEditingTemplate(template.id);
    setEditForm({
      name: template.name || '',
      trigger_description: template.trigger_description || '',
      trigger_details: template.trigger_details || '',
      recipients: template.recipients || '',
      cc_emails: template.cc_emails || '',
      subject_template: template.subject_template || '',
      body_template: template.body_template || '',
    });
  }

  function handleCancelEdit() {
    setEditingTemplate(null);
  }

  async function handleSave(templateId: string) {
    setSaving(true);
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'update',
          id: templateId,
          data: editForm,
        }),
      });
      await loadTemplates();
      setEditingTemplate(null);
    } catch (err) {
      alert('Error saving template: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newForm.name.trim()) {
      alert('Template name is required');
      return;
    }
    setSaving(true);
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'create',
          data: newForm,
        }),
      });
      await loadTemplates();
      setShowCreateForm(false);
      setNewForm({
        name: '',
        trigger_description: '',
        trigger_details: '',
        recipients: '',
        cc_emails: '',
        subject_template: '',
        body_template: '',
      });
    } catch (err) {
      alert('Error creating template: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(templateId: string) {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'email_templates',
          action: 'delete',
          id: templateId,
        }),
      });
      await loadTemplates();
      setExpandedTemplate(null);
    } catch (err) {
      alert('Error deleting template: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
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
            These email templates are sent automatically based on their triggers. Click a template to view or edit.
          </p>
          <button className={styles.btnPrimary} onClick={() => setShowCreateForm(true)}>
            + Create Template
          </button>
        </div>

        {/* Create New Template Form */}
        {showCreateForm && (
          <div className={styles.createForm}>
            <h3>Create New Template</h3>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Template Name *</label>
                <input
                  className={styles.formInput}
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="e.g., PM Invite Email"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Trigger Description</label>
                <input
                  className={styles.formInput}
                  value={newForm.trigger_description}
                  onChange={(e) => setNewForm({ ...newForm, trigger_description: e.target.value })}
                  placeholder="e.g., When PM is invited"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Trigger Details</label>
                <input
                  className={styles.formInput}
                  value={newForm.trigger_details}
                  onChange={(e) => setNewForm({ ...newForm, trigger_details: e.target.value })}
                  placeholder="e.g., Sent when a new PM is added to the system"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recipients</label>
                <input
                  className={styles.formInput}
                  value={newForm.recipients}
                  onChange={(e) => setNewForm({ ...newForm, recipients: e.target.value })}
                  placeholder="e.g., Property Manager"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>CC Emails</label>
                <input
                  className={styles.formInput}
                  value={newForm.cc_emails}
                  onChange={(e) => setNewForm({ ...newForm, cc_emails: e.target.value })}
                  placeholder="e.g., admin@example.com"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Subject Template</label>
                <input
                  className={styles.formInput}
                  value={newForm.subject_template}
                  onChange={(e) => setNewForm({ ...newForm, subject_template: e.target.value })}
                  placeholder="e.g., Welcome to {{property_name}}"
                />
              </div>
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.formLabel}>Body Template</label>
                <textarea
                  className={styles.formTextarea}
                  value={newForm.body_template}
                  onChange={(e) => setNewForm({ ...newForm, body_template: e.target.value })}
                  rows={6}
                  placeholder="Email body with {{variables}}..."
                />
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.btnPrimary} onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create Template'}
              </button>
              <button className={styles.btnSecondary} onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Templates List */}
        {templates.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <h3>No email templates found</h3>
            <p>Create your first template to get started with automated emails.</p>
          </div>
        ) : (
          <div className={styles.templatesList}>
            {templates.map((template) => {
              const isExpanded = expandedTemplate === template.id;
              const isEditing = editingTemplate === template.id;

              return (
                <div key={template.id} className={styles.templateCard}>
                  <div className={styles.templateHeader} onClick={() => handleExpand(template.id)}>
                    <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>▶</span>
                    <div className={styles.templateInfo}>
                      <h3 className={styles.templateName}>{template.name}</h3>
                      {template.trigger_description && (
                        <span className={styles.triggerBadge}>{template.trigger_description}</span>
                      )}
                    </div>
                    <div className={styles.templateMeta}>
                      {template.subject_template && (
                        <span className={styles.subjectPreview}>
                          Subject: {template.subject_template.substring(0, 40)}
                          {template.subject_template.length > 40 ? '...' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.templateContent}>
                      {isEditing ? (
                        <div className={styles.editorForm}>
                          <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                              <label className={styles.formLabel}>Template Name</label>
                              <input
                                className={styles.formInput}
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              />
                            </div>
                            <div className={styles.formGroup}>
                              <label className={styles.formLabel}>Trigger Description</label>
                              <input
                                className={styles.formInput}
                                value={editForm.trigger_description}
                                onChange={(e) => setEditForm({ ...editForm, trigger_description: e.target.value })}
                              />
                            </div>
                            <div className={styles.formGroup}>
                              <label className={styles.formLabel}>Trigger Details</label>
                              <input
                                className={styles.formInput}
                                value={editForm.trigger_details}
                                onChange={(e) => setEditForm({ ...editForm, trigger_details: e.target.value })}
                              />
                            </div>
                            <div className={styles.formGroup}>
                              <label className={styles.formLabel}>Recipients</label>
                              <input
                                className={styles.formInput}
                                value={editForm.recipients}
                                onChange={(e) => setEditForm({ ...editForm, recipients: e.target.value })}
                              />
                            </div>
                            <div className={styles.formGroup}>
                              <label className={styles.formLabel}>CC Emails</label>
                              <input
                                className={styles.formInput}
                                value={editForm.cc_emails}
                                onChange={(e) => setEditForm({ ...editForm, cc_emails: e.target.value })}
                              />
                            </div>
                            <div className={styles.formGroup}>
                              <label className={styles.formLabel}>Subject Template</label>
                              <input
                                className={styles.formInput}
                                value={editForm.subject_template}
                                onChange={(e) => setEditForm({ ...editForm, subject_template: e.target.value })}
                              />
                            </div>
                            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                              <label className={styles.formLabel}>Body Template</label>
                              <textarea
                                className={styles.formTextarea}
                                value={editForm.body_template}
                                onChange={(e) => setEditForm({ ...editForm, body_template: e.target.value })}
                                rows={10}
                              />
                            </div>
                          </div>
                          <div className={styles.formActions}>
                            <button
                              className={styles.btnPrimary}
                              onClick={() => handleSave(template.id)}
                              disabled={saving}
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button className={styles.btnSecondary} onClick={handleCancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.templateDetails}>
                          <div className={styles.detailsGrid}>
                            <div className={styles.detailItem}>
                              <label>Trigger Details</label>
                              <span>{template.trigger_details || '—'}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Recipients</label>
                              <span>{template.recipients || '—'}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>CC Emails</label>
                              <span>{template.cc_emails || '—'}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Subject</label>
                              <span>{template.subject_template || '—'}</span>
                            </div>
                          </div>
                          <div className={styles.bodySection}>
                            <label>Email Body</label>
                            <pre className={styles.bodyPreview}>{template.body_template || '(No body template)'}</pre>
                          </div>
                          <div className={styles.templateActions}>
                            <button className={styles.btnSecondary} onClick={() => handleEdit(template)}>
                              Edit Template
                            </button>
                            <button className={styles.btnDanger} onClick={() => handleDelete(template.id)}>
                              Delete
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
        )}
      </div>
    </AdminShell>
  );
}
