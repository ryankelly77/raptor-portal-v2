'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '../editor.module.css';

interface ActivityLog {
  id: string;
  project_id: string | null;
  phase_id: string | null;
  task_id: string | null;
  action: string;
  description: string;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ActivityLogPanelProps {
  projectId: string;
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function ActivityLogPanel({ projectId }: ActivityLogPanelProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'activity_logs',
          action: 'read',
          filters: { project_id: projectId },
        }),
      });
      const result = await response.json();
      if (result.data) {
        // Sort by created_at descending
        const sorted = result.data.sort(
          (a: ActivityLog, b: ActivityLog) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setLogs(sorted);
      }
    } catch (err) {
      console.error('Error loading activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getActionIcon(action: string) {
    switch (action) {
      case 'created':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        );
      case 'updated':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" width="16" height="16">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        );
      case 'deleted':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" width="16" height="16">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        );
      case 'task_completed':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" width="16" height="16">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case 'status_changed':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case 'document_uploaded':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" width="16" height="16">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  }

  if (loading) {
    return (
      <div className={styles.editorCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Activity Log</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editorCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Activity Log</h3>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.activityList}>
          {logs.map((log) => (
            <div key={log.id} className={styles.activityItem}>
              <div className={styles.activityIcon}>{getActionIcon(log.action)}</div>
              <div className={styles.activityContent}>
                <p className={styles.activityDescription}>{log.description}</p>
                <p className={styles.activityMeta}>
                  {log.performed_by && <span>{log.performed_by} &bull; </span>}
                  {formatDate(log.created_at)}
                </p>
              </div>
            </div>
          ))}

          {logs.length === 0 && (
            <div className={styles.emptyState}>No activity recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
