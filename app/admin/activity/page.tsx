'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './activity.module.css';

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

interface RawProject {
  id: string;
  project_number: string | null;
  property_id: string;
  location_id: string | null;
}

interface Property {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  property_id: string;
}

interface EnrichedProject {
  id: string;
  project_number: string;
  property_name: string;
  location_name: string;
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const ITEMS_PER_PAGE = 25;

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [projects, setProjects] = useState<EnrichedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [actionFilter, setActionFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load all data in parallel
      const [projectsRes, propertiesRes, locationsRes, logsRes] = await Promise.all([
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'projects', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'properties', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'locations', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'activity_logs', action: 'read' }),
        }),
      ]);

      const [projectsData, propertiesData, locationsData, logsData] = await Promise.all([
        projectsRes.json(),
        propertiesRes.json(),
        locationsRes.json(),
        logsRes.json(),
      ]);

      const rawProjects: RawProject[] = projectsData.data || [];
      const properties: Property[] = propertiesData.data || [];
      const locations: Location[] = locationsData.data || [];

      // Enrich projects with related data
      const enrichedProjects: EnrichedProject[] = rawProjects.map((project) => {
        const location = locations.find((l) => l.id === project.location_id);
        const property = location
          ? properties.find((p) => p.id === location.property_id)
          : properties.find((p) => p.id === project.property_id);

        return {
          id: project.id,
          project_number: project.project_number || 'N/A',
          property_name: property?.name || 'Unknown Property',
          location_name: location?.name || 'Unknown Location',
        };
      });

      setProjects(enrichedProjects);
      setLogs(logsData.data || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter logs
  const filteredLogs = logs
    .filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (projectFilter !== 'all' && log.project_id !== projectFilter) return false;
      if (dateFilter) {
        const logDate = new Date(log.created_at).toISOString().split('T')[0];
        if (logDate !== dateFilter) return false;
      }
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !log.description.toLowerCase().includes(search) &&
          !log.performed_by?.toLowerCase().includes(search)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  function getProjectInfo(projectId: string | null) {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId);
  }

  function getActionIcon(action: string) {
    switch (action) {
      case 'created':
        return (
          <div className={`${styles.activityIcon} ${styles.created}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        );
      case 'updated':
        return (
          <div className={`${styles.activityIcon} ${styles.updated}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </div>
        );
      case 'deleted':
        return (
          <div className={`${styles.activityIcon} ${styles.deleted}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </div>
        );
      case 'task_completed':
        return (
          <div className={`${styles.activityIcon} ${styles.completed}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        );
      case 'status_changed':
        return (
          <div className={`${styles.activityIcon} ${styles.status}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        );
      case 'document_uploaded':
        return (
          <div className={`${styles.activityIcon} ${styles.document}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
        );
      case 'reminder_sent':
      case 'email_sent':
        return (
          <div className={`${styles.activityIcon} ${styles.email}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
        );
      case 'email_delivered':
        return (
          <div className={`${styles.activityIcon} ${styles.emailDelivered}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
        );
      case 'email_opened':
        return (
          <div className={`${styles.activityIcon} ${styles.emailOpened}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
        );
      case 'email_clicked':
        return (
          <div className={`${styles.activityIcon} ${styles.emailClicked}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <path d="M15 3h6v6" />
              <path d="M10 14L21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </div>
        );
      default:
        return (
          <div className={styles.activityIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        );
    }
  }

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

  function clearFilters() {
    setActionFilter('all');
    setProjectFilter('all');
    setDateFilter('');
    setSearchTerm('');
    setPage(1);
  }

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));

  if (loading) {
    return (
      <AdminShell title="Activity Log">
        <div className={styles.activityPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Activity Log">
      <div className={styles.activityPage}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Activity Log</h1>
        <div className={styles.headerActions}>
          <button className={styles.refreshButton} onClick={loadData}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Search</label>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Search activity..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Action</label>
          <select
            className={styles.filterSelect}
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Actions</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Project</label>
          <select
            className={styles.filterSelect}
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.property_name} - {project.location_name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Date</label>
          <input
            type="date"
            className={styles.filterInput}
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {(actionFilter !== 'all' || projectFilter !== 'all' || dateFilter || searchTerm) && (
          <button className={styles.clearFilters} onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Activity List */}
      <div className={styles.activityCard}>
        {paginatedLogs.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3>No activity found</h3>
            <p>
              {actionFilter !== 'all' || projectFilter !== 'all' || dateFilter || searchTerm
                ? 'Try adjusting your filters'
                : 'Activity will appear here as actions are performed'}
            </p>
          </div>
        ) : (
          <>
            <div className={styles.activityList}>
              {paginatedLogs.map((log) => {
                const project = getProjectInfo(log.project_id);
                return (
                  <div key={log.id} className={styles.activityItem}>
                    {getActionIcon(log.action)}
                    <div className={styles.activityContent}>
                      <p className={styles.activityDescription}>{log.description}</p>
                      <div className={styles.activityMeta}>
                        {project && (
                          <span className={styles.activityProject}>
                            {project.property_name} - {project.location_name}
                          </span>
                        )}
                        {log.performed_by && (
                          <span className={styles.activityUser}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            {log.performed_by}
                          </span>
                        )}
                        <span className={styles.activityTime}>{formatDate(log.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  Showing {(page - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(page * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length}
                </span>
                <div className={styles.paginationButtons}>
                  <button
                    className={styles.paginationButton}
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    Previous
                  </button>
                  <button
                    className={styles.paginationButton}
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </AdminShell>
  );
}
