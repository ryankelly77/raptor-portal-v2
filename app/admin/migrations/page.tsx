'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './migrations.module.css';

interface Migration {
  id: string;
  name: string;
  version: string;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  executed_at: string | null;
  created_at: string;
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Sample migrations for display
const SAMPLE_MIGRATIONS: Migration[] = [
  {
    id: '1',
    name: 'Initial Schema',
    version: '001',
    description: 'Create initial database schema with projects, phases, and tasks tables',
    status: 'completed',
    executed_at: '2024-01-15T10:30:00Z',
    created_at: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    name: 'Add Property Managers',
    version: '002',
    description: 'Add property_managers, properties, and locations tables',
    status: 'completed',
    executed_at: '2024-01-20T14:00:00Z',
    created_at: '2024-01-20T14:00:00Z',
  },
  {
    id: '3',
    name: 'Add Equipment Table',
    version: '003',
    description: 'Create equipment table with status tracking',
    status: 'completed',
    executed_at: '2024-02-01T09:00:00Z',
    created_at: '2024-02-01T09:00:00Z',
  },
  {
    id: '4',
    name: 'Add Messages System',
    version: '004',
    description: 'Create messages table for PM communication',
    status: 'completed',
    executed_at: '2024-02-10T11:30:00Z',
    created_at: '2024-02-10T11:30:00Z',
  },
  {
    id: '5',
    name: 'Add Activity Logs',
    version: '005',
    description: 'Create activity_logs table for audit trail',
    status: 'completed',
    executed_at: '2024-02-15T16:00:00Z',
    created_at: '2024-02-15T16:00:00Z',
  },
  {
    id: '6',
    name: 'Add Temperature Logs',
    version: '006',
    description: 'Create drivers, temp_log_sessions, and temp_log_entries tables',
    status: 'completed',
    executed_at: '2024-03-01T08:00:00Z',
    created_at: '2024-03-01T08:00:00Z',
  },
];

export default function MigrationsPage() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [loading, setLoading] = useState(true);
  const [sqlInput, setSqlInput] = useState('');
  const [sqlResult, setSqlResult] = useState<{ success: boolean; message: string; data?: unknown } | null>(null);
  const [executing, setExecuting] = useState(false);

  const loadMigrations = useCallback(async () => {
    try {
      setLoading(true);
      // Try to load from database, fall back to sample data
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'migrations', action: 'read' }),
      });
      const result = await response.json();

      if (result.data && result.data.length > 0) {
        setMigrations(result.data);
      } else {
        // Use sample migrations if table doesn't exist
        setMigrations(SAMPLE_MIGRATIONS);
      }
    } catch (err) {
      console.error('Error loading migrations:', err);
      setMigrations(SAMPLE_MIGRATIONS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMigrations();
  }, [loadMigrations]);

  async function handleExecuteSql() {
    if (!sqlInput.trim()) return;

    if (!window.confirm('Are you sure you want to execute this SQL? This action may be irreversible.')) {
      return;
    }

    setExecuting(true);
    setSqlResult(null);

    try {
      const response = await fetch('/api/admin/sql', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sql: sqlInput.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        setSqlResult({
          success: true,
          message: 'Query executed successfully',
          data: result.data,
        });
      } else {
        setSqlResult({
          success: false,
          message: result.error || 'Query failed',
        });
      }
    } catch (err) {
      setSqlResult({
        success: false,
        message: 'Error executing query: ' + (err instanceof Error ? err.message : 'Unknown'),
      });
    } finally {
      setExecuting(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Not executed';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return (
          <div className={`${styles.migrationStatus} ${styles.completed}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        );
      case 'pending':
        return (
          <div className={`${styles.migrationStatus} ${styles.pending}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className={`${styles.migrationStatus} ${styles.failed}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <AdminShell title="Migrations">
        <div className={styles.migrationsPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Migrations">
      <div className={styles.migrationsPage}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Database Migrations</h1>
          <p className={styles.pageDescription}>
            Manage database schema changes and run SQL queries
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshButton} onClick={loadMigrations}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className={styles.warningBanner}>
        <svg className={styles.warningIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className={styles.warningContent}>
          <h3>Caution: Database Operations</h3>
          <p>
            Migrations and SQL queries can permanently modify your database. Always backup your data before
            running migrations or executing raw SQL.
          </p>
        </div>
      </div>

      {/* Migrations List */}
      <div className={styles.migrationsCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Migration History</h2>
        </div>

        <div className={styles.migrationsList}>
          {migrations.map((migration) => (
            <div key={migration.id} className={styles.migrationItem}>
              {getStatusIcon(migration.status)}
              <div className={styles.migrationInfo}>
                <h3 className={styles.migrationName}>{migration.name}</h3>
                <p className={styles.migrationDescription}>{migration.description}</p>
              </div>
              <div className={styles.migrationMeta}>
                <span className={styles.migrationVersion}>v{migration.version}</span>
                <span>{formatDate(migration.executed_at)}</span>
              </div>
              {migration.status === 'pending' && (
                <div className={styles.migrationActions}>
                  <button className={styles.btnRun}>Run</button>
                </div>
              )}
              {migration.status === 'completed' && (
                <div className={styles.migrationActions}>
                  <button className={styles.btnRevert}>Revert</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* SQL Editor */}
        <div className={styles.sqlEditor}>
          <h3 className={styles.sqlEditorTitle}>Raw SQL Query</h3>
          <textarea
            className={styles.sqlInput}
            placeholder="Enter SQL query... (e.g., SELECT * FROM projects LIMIT 10)"
            value={sqlInput}
            onChange={(e) => setSqlInput(e.target.value)}
          />
          <div className={styles.sqlActions}>
            <button
              className={styles.btnPrimary}
              onClick={handleExecuteSql}
              disabled={executing || !sqlInput.trim()}
            >
              {executing ? 'Executing...' : 'Execute Query'}
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => {
                setSqlInput('');
                setSqlResult(null);
              }}
            >
              Clear
            </button>
          </div>

          {sqlResult && (
            <div className={`${styles.sqlResult} ${sqlResult.success ? styles.success : styles.error}`}>
              {sqlResult.message}
              {sqlResult.data !== undefined && sqlResult.data !== null && (
                <pre>{JSON.stringify(sqlResult.data, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </AdminShell>
  );
}
