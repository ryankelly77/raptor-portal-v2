'use client';

import { useState, useRef } from 'react';
import { updatePhase, deletePhase, createTask, updateTask, deleteTask, uploadFile, updateProject, fetchPhases, fetchTasks } from '@/lib/api/admin';
import type { Phase, Task as TaskType } from '@/types/database';
import { TaskEditor } from './TaskEditor';
import styles from '../editor.module.css';

interface Task {
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
  deliveries: unknown[] | null;
  document_url: string | null;
  pm_text_value: string | null;
  pm_text_response: string | null;
  notes: string | null;
}

interface PhaseWithTasks extends Phase {
  tasks?: Task[];
}

interface PhaseEditorProps {
  phase: PhaseWithTasks;
  phaseNumber: number;
  projectId: string;
  onRefresh: () => Promise<void>;
}

export function PhaseEditor({ phase, phaseNumber, projectId, onRefresh }: PhaseEditorProps) {
  const [expanded, setExpanded] = useState(phase.status === 'in_progress');
  const [form, setForm] = useState({
    title: phase.title,
    status: phase.status,
    start_date: phase.start_date || '',
    end_date: phase.end_date || '',
    description: phase.description || '',
    is_approximate: phase.is_approximate || false,
    property_responsibility: phase.property_responsibility || '',
    contractor_name: phase.contractor_name || '',
    contractor_scheduled_date: phase.contractor_scheduled_date || '',
    document_url: phase.document_url || '',
    document_label: phase.document_label || '',
  });
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskIsPm, setNewTaskIsPm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusClass =
    phase.status === 'completed'
      ? styles.completed
      : phase.status === 'in_progress'
        ? styles.inProgress
        : styles.pending;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updatePhase(phase.id, {
        title: form.title,
        status: form.status as Phase['status'],
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        description: form.description || null,
        is_approximate: form.is_approximate,
        property_responsibility: form.property_responsibility || null,
        contractor_name: form.contractor_name || null,
        contractor_scheduled_date: form.contractor_scheduled_date || null,
        document_url: form.document_url || null,
        document_label: form.document_label || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await onRefresh();
    } catch (err) {
      alert('Error saving phase: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePhase() {
    if (!window.confirm('Delete this phase and all its tasks?')) return;
    try {
      await deletePhase(phase.id);
      await onRefresh();
    } catch (err) {
      alert('Error deleting phase: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleAddTask() {
    if (!newTaskLabel.trim()) return;
    try {
      const label = newTaskIsPm ? `[PM] ${newTaskLabel.trim()}` : newTaskLabel.trim();
      await createTask({
        phase_id: phase.id,
        label,
        completed: false,
        sort_order: (phase.tasks?.length || 0) + 1,
        scheduled_date: null,
        upload_speed: null,
        download_speed: null,
        enclosure_type: null,
        enclosure_color: null,
        custom_color_name: null,
        smartfridge_qty: null,
        smartcooker_qty: null,
        delivery_carrier: null,
        tracking_number: null,
        deliveries: null,
        document_url: null,
        pm_text_value: null,
        pm_text_response: null,
        notes: null,
      });
      setNewTaskLabel('');
      setNewTaskIsPm(false);
      await onRefresh();
    } catch (err) {
      alert('Error adding task: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    try {
      await updateTask(taskId, updates);

      // Recalculate overall_progress after task update
      if ('completed' in updates) {
        await recalculateProjectProgress(projectId);
      }

      await onRefresh();
    } catch (err) {
      alert('Error updating task: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  // Calculate overall project progress based on completed tasks
  async function recalculateProjectProgress(projId: string) {
    try {
      // Get all phases for this project
      const phases = await fetchPhases(projId);

      // Get all tasks for all phases
      let totalTasks = 0;
      let completedTasks = 0;

      for (const p of phases) {
        const tasks = await fetchTasks(p.id);
        totalTasks += tasks.length;
        completedTasks += tasks.filter((t: TaskType) => t.completed).length;
      }

      // Calculate and update progress
      const newProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      await updateProject(projId, { overall_progress: newProgress });
    } catch (err) {
      console.error('Error recalculating project progress:', err);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTask(taskId);
      await onRefresh();
    } catch (err) {
      alert('Error deleting task: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `phase-${phase.id}-${Date.now()}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const publicUrl = await uploadFile('project-files', filePath, file);

      const newLabel = form.document_label || file.name.replace(/\.[^/.]+$/, '');
      await updatePhase(phase.id, {
        document_url: publicUrl,
        document_label: newLabel,
      });
      setForm((prev) => ({ ...prev, document_url: publicUrl, document_label: newLabel }));
      await onRefresh();
    } catch (err) {
      alert('Error uploading file: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveDocument() {
    if (!window.confirm('Remove this document?')) return;
    await updatePhase(phase.id, { document_url: null, document_label: null });
    setForm((prev) => ({ ...prev, document_url: '', document_label: '' }));
    await onRefresh();
  }

  return (
    <div className={`${styles.phaseBlock} ${statusClass}`}>
      <div className={styles.phaseHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.phaseNumber}>{phaseNumber}</span>
        <span className={styles.phaseTitle}>{phase.title}</span>
        <span className={`${styles.phaseStatusBadge} ${statusClass}`}>
          {phase.status === 'not_started' ? 'Pending' : phase.status === 'in_progress' ? 'In Progress' : 'Completed'}
        </span>
        <span className={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className={styles.phaseContent}>
          {/* Phase Form */}
          <div className={styles.phaseForm}>
            <div className={styles.formRow}>
              <input
                className={styles.formInput}
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className={`${styles.formRow} ${styles.twoCol}`}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Start Date</label>
                <input
                  type="date"
                  className={styles.formInput}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>End Date</label>
                <input
                  type="date"
                  className={styles.formInput}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <textarea
                className={styles.formTextarea}
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className={styles.checkboxRow}>
              <label>
                <input
                  type="checkbox"
                  checked={form.is_approximate}
                  onChange={(e) => setForm({ ...form, is_approximate: e.target.checked })}
                />
                Approximate dates
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!form.property_responsibility}
                  onChange={(e) =>
                    setForm({ ...form, property_responsibility: e.target.checked ? 'true' : '' })
                  }
                />
                Property responsibility
              </label>
            </div>
            {form.property_responsibility && (
              <div className={`${styles.formRow} ${styles.twoCol}`}>
                <input
                  className={styles.formInput}
                  placeholder="Contractor name"
                  value={form.contractor_name}
                  onChange={(e) => setForm({ ...form, contractor_name: e.target.value })}
                />
                <input
                  className={styles.formInput}
                  placeholder="Scheduled date"
                  value={form.contractor_scheduled_date}
                  onChange={(e) => setForm({ ...form, contractor_scheduled_date: e.target.value })}
                />
              </div>
            )}
            {!phase.title.toLowerCase().includes('survey') && (
              <div className={`${styles.formRow} ${styles.twoCol}`}>
                <input
                  className={styles.formInput}
                  placeholder="Document label"
                  value={form.document_label}
                  onChange={(e) => setForm({ ...form, document_label: e.target.value })}
                />
                <input
                  className={styles.formInput}
                  placeholder="Document URL"
                  value={form.document_url}
                  onChange={(e) => setForm({ ...form, document_url: e.target.value })}
                />
              </div>
            )}
            <div className={styles.btnGroup}>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
              </button>
              <button className={styles.btnDanger} onClick={handleDeletePhase}>
                Delete Phase
              </button>
            </div>
          </div>

          {/* Document Upload */}
          {!phase.title.toLowerCase().includes('survey') && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Document
              </h4>
              {phase.document_url ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href={phase.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#f97316', textDecoration: 'underline' }}
                  >
                    {phase.document_label || 'View Document'}
                  </a>
                  <button className={styles.btnDeleteSmall} onClick={handleRemoveDocument}>
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                  />
                  <button
                    className={styles.btnSecondary}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload Document'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tasks Section */}
          <div className={styles.tasksSection}>
            <h4>Tasks</h4>
            {phase.tasks?.map((task) => (
              <TaskEditor
                key={task.id}
                task={task}
                projectId={projectId}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
              />
            ))}
            <div className={styles.addTaskRow}>
              <input
                className={styles.formInput}
                placeholder="New task..."
                value={newTaskLabel}
                onChange={(e) => setNewTaskLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTaskLabel.trim()) {
                    handleAddTask();
                  }
                }}
              />
              <label className={styles.pmTaskToggle}>
                <input
                  type="checkbox"
                  checked={newTaskIsPm}
                  onChange={(e) => setNewTaskIsPm(e.target.checked)}
                />
                PM
              </label>
              <button className={styles.btnAddSmall} onClick={handleAddTask}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
