'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './temperature.module.css';

interface Driver {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  access_token: string;
  created_at: string;
}

interface TempLogEntry {
  id: string;
  session_id: string;
  entry_type: 'start' | 'stop' | 'end';
  stop_number: number | null;
  location_name: string | null;
  temperature: number;
  notes: string | null;
  photo_url: string | null;
  timestamp: string;
}

interface TempLogSession {
  id: string;
  driver_id: string;
  session_date: string;
  status: 'in_progress' | 'completed';
  notes: string | null;
  created_at: string;
  entries?: TempLogEntry[];
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function TemperaturePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [sessions, setSessions] = useState<TempLogSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'drivers' | 'sessions'>('drivers');

  // Driver form state
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [newDriverForm, setNewDriverForm] = useState({ name: '', email: '', phone: '' });
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editDriverForm, setEditDriverForm] = useState({ name: '', email: '', phone: '' });

  // Session filters
  const [dateFilter, setDateFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Export
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Photo modal
  const [modalPhoto, setModalPhoto] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load drivers
      const driversRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'drivers', action: 'read' }),
      });
      const driversData = await driversRes.json();
      setDrivers(driversData.data || []);

      // Load sessions
      const sessionsRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'temp_log_sessions', action: 'read' }),
      });
      const sessionsData = await sessionsRes.json();
      const sessionsArray = sessionsData.data || [];

      // Load entries for each session
      const sessionsWithEntries = await Promise.all(
        sessionsArray.map(async (session: TempLogSession) => {
          const entriesRes = await fetch('/api/admin/crud', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              table: 'temp_log_entries',
              action: 'read',
              filters: { session_id: session.id },
            }),
          });
          const entriesData = await entriesRes.json();
          return { ...session, entries: entriesData.data || [] };
        })
      );

      setSessions(sessionsWithEntries);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Driver CRUD
  async function handleCreateDriver() {
    if (!newDriverForm.name.trim()) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'drivers',
          action: 'create',
          data: {
            name: newDriverForm.name.trim(),
            email: newDriverForm.email.trim() || null,
            phone: newDriverForm.phone.trim() || null,
            is_active: true,
          },
        }),
      });
      setNewDriverForm({ name: '', email: '', phone: '' });
      setShowAddDriver(false);
      await loadData();
    } catch (err) {
      alert('Error creating driver: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdateDriver(id: string) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'drivers',
          action: 'update',
          id,
          data: {
            name: editDriverForm.name.trim(),
            email: editDriverForm.email.trim() || null,
            phone: editDriverForm.phone.trim() || null,
          },
        }),
      });
      setEditingDriver(null);
      await loadData();
    } catch (err) {
      alert('Error updating driver: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleToggleDriverActive(driver: Driver) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'drivers',
          action: 'update',
          id: driver.id,
          data: { is_active: !driver.is_active },
        }),
      });
      await loadData();
    } catch (err) {
      alert('Error updating driver: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDeleteDriver(id: string) {
    if (!window.confirm('Delete this driver? This cannot be undone.')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'drivers', action: 'delete', id }),
      });
      await loadData();
    } catch (err) {
      alert('Error deleting driver: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!window.confirm('Delete this session and all its entries? This cannot be undone.')) return;
    try {
      // Delete entries first
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'temp_log_entries',
          action: 'delete',
          filters: { session_id: sessionId },
        }),
      });
      // Then delete session
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'temp_log_sessions', action: 'delete', id: sessionId }),
      });
      if (selectedSession === sessionId) setSelectedSession(null);
      await loadData();
    } catch (err) {
      alert('Error deleting session: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  function copyDriverLink(token: string) {
    const url = `${window.location.origin}/driver/${token}`;
    navigator.clipboard.writeText(url);
    alert('Driver link copied to clipboard!');
  }

  function startEditDriver(driver: Driver) {
    setEditingDriver(driver.id);
    setEditDriverForm({
      name: driver.name,
      email: driver.email || '',
      phone: driver.phone || '',
    });
  }

  function getDriverName(driverId: string) {
    const driver = drivers.find((d) => d.id === driverId);
    return driver?.name || 'Unknown Driver';
  }

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    if (dateFilter && session.session_date !== dateFilter) return false;
    if (driverFilter && session.driver_id !== driverFilter) return false;
    return true;
  });

  // Export CSV
  function handleExportCSV() {
    const exportSessions = sessions.filter((session) => {
      const sessionDate = session.session_date;
      if (exportStartDate && sessionDate < exportStartDate) return false;
      if (exportEndDate && sessionDate > exportEndDate) return false;
      return true;
    });

    if (exportSessions.length === 0) {
      alert('No sessions found in the selected date range.');
      return;
    }

    const rows: string[][] = [];
    rows.push(['Date', 'Time', 'Driver', 'Session Status', 'Entry Type', 'Stop #', 'Location', 'Temperature (°F)', 'Notes', 'Photo URL']);

    exportSessions.forEach((session) => {
      const driverName = getDriverName(session.driver_id);
      const sessionDate = new Date(session.session_date).toLocaleDateString();

      if (!session.entries || session.entries.length === 0) {
        rows.push([sessionDate, '', driverName, session.status, '', '', '', '', session.notes || '', '']);
      } else {
        session.entries.forEach((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          rows.push([
            sessionDate,
            time,
            driverName,
            session.status,
            entry.entry_type,
            String(entry.stop_number || ''),
            entry.location_name || '',
            String(entry.temperature),
            entry.notes || '',
            entry.photo_url || '',
          ]);
        });
      }
    });

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `temp-logs-${exportStartDate || 'all'}-to-${exportEndDate || 'all'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const selectedSessionData = sessions.find((s) => s.id === selectedSession);

  if (loading) {
    return (
      <AdminShell title="Temperature Logs">
        <div className={styles.temperaturePage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Temperature Logs">
      <div className={styles.temperaturePage}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Temperature Logs</h1>
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

      {/* Section Tabs */}
      <div className={styles.sectionTabs}>
        <button
          className={`${styles.tabButton} ${activeSection === 'drivers' ? styles.active : ''}`}
          onClick={() => setActiveSection('drivers')}
        >
          Drivers ({drivers.length})
        </button>
        <button
          className={`${styles.tabButton} ${activeSection === 'sessions' ? styles.active : ''}`}
          onClick={() => setActiveSection('sessions')}
        >
          Sessions ({sessions.length})
        </button>
      </div>

      {/* Drivers Section */}
      {activeSection === 'drivers' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Drivers</h2>
            <button className={styles.btnPrimary} onClick={() => setShowAddDriver(true)}>
              + Add Driver
            </button>
          </div>

          {showAddDriver && (
            <div className={styles.addDriverForm}>
              <input
                placeholder="Driver name *"
                value={newDriverForm.name}
                onChange={(e) => setNewDriverForm({ ...newDriverForm, name: e.target.value })}
              />
              <input
                placeholder="Email (optional)"
                value={newDriverForm.email}
                onChange={(e) => setNewDriverForm({ ...newDriverForm, email: e.target.value })}
              />
              <input
                placeholder="Phone (optional)"
                value={newDriverForm.phone}
                onChange={(e) => setNewDriverForm({ ...newDriverForm, phone: e.target.value })}
              />
              <button className={styles.btnPrimary} onClick={handleCreateDriver} disabled={!newDriverForm.name.trim()}>
                Create
              </button>
              <button className={styles.btnSecondary} onClick={() => setShowAddDriver(false)}>
                Cancel
              </button>
            </div>
          )}

          <div className={styles.cardBody}>
            {drivers.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No drivers yet. Click &quot;+ Add Driver&quot; to create one.</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) =>
                    editingDriver === driver.id ? (
                      <tr key={driver.id} className={styles.editing}>
                        <td>
                          <input
                            className={styles.editInput}
                            value={editDriverForm.name}
                            onChange={(e) => setEditDriverForm({ ...editDriverForm, name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.editInput}
                            value={editDriverForm.email}
                            onChange={(e) => setEditDriverForm({ ...editDriverForm, email: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.editInput}
                            value={editDriverForm.phone}
                            onChange={(e) => setEditDriverForm({ ...editDriverForm, phone: e.target.value })}
                          />
                        </td>
                        <td colSpan={2}>
                          <div className={styles.actionButtons}>
                            <button className={`${styles.btnSmall} ${styles.edit}`} onClick={() => handleUpdateDriver(driver.id)}>
                              Save
                            </button>
                            <button className={`${styles.btnSmall} ${styles.edit}`} onClick={() => setEditingDriver(null)}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={driver.id} className={!driver.is_active ? styles.inactive : ''}>
                        <td>{driver.name}</td>
                        <td>{driver.email || '—'}</td>
                        <td>{driver.phone || '—'}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${driver.is_active ? styles.active : styles.inactive}`}>
                            {driver.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actionButtons}>
                            <button className={`${styles.btnSmall} ${styles.link}`} onClick={() => copyDriverLink(driver.access_token)}>
                              Copy Link
                            </button>
                            <button className={`${styles.btnSmall} ${styles.edit}`} onClick={() => startEditDriver(driver)}>
                              Edit
                            </button>
                            <button className={`${styles.btnSmall} ${styles.toggle}`} onClick={() => handleToggleDriverActive(driver)}>
                              {driver.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className={`${styles.btnSmall} ${styles.delete}`} onClick={() => handleDeleteDriver(driver.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Sessions Section */}
      {activeSection === 'sessions' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Temperature Log Sessions</h2>
            <button className={styles.exportButton} onClick={handleExportCSV}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
          </div>

          {/* Filters */}
          <div className={styles.filters}>
            <input
              type="date"
              className={styles.filterInput}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              placeholder="Filter by date"
            />
            <select
              className={styles.filterSelect}
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
            >
              <option value="">All Drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            {(dateFilter || driverFilter) && (
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setDateFilter('');
                  setDriverFilter('');
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Export Date Range */}
          <div className={styles.exportModal}>
            <h3 className={styles.exportTitle}>Export Date Range</h3>
            <div className={styles.exportRow}>
              <div className={styles.exportGroup}>
                <label className={styles.exportLabel}>Start Date</label>
                <input
                  type="date"
                  className={styles.filterInput}
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                />
              </div>
              <div className={styles.exportGroup}>
                <label className={styles.exportLabel}>End Date</label>
                <input
                  type="date"
                  className={styles.filterInput}
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={styles.cardBody}>
            {filteredSessions.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No sessions found.</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Entries</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr
                      key={session.id}
                      onClick={() => setSelectedSession(selectedSession === session.id ? null : session.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{formatDate(session.session_date)}</td>
                      <td>{getDriverName(session.driver_id)}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${session.status === 'completed' ? styles.completed : styles.inProgress}`}
                        >
                          {session.status === 'in_progress' ? 'In Progress' : 'Completed'}
                        </span>
                      </td>
                      <td>{session.entries?.length || 0} entries</td>
                      <td>
                        <div className={styles.actionButtons} onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`${styles.btnSmall} ${styles.edit}`}
                            onClick={() => setSelectedSession(selectedSession === session.id ? null : session.id)}
                          >
                            {selectedSession === session.id ? 'Hide' : 'View'}
                          </button>
                          <button
                            className={`${styles.btnSmall} ${styles.delete}`}
                            onClick={() => handleDeleteSession(session.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Session Detail */}
          {selectedSessionData && (
            <div className={styles.sessionDetail}>
              <div className={styles.sessionHeader}>
                <div>
                  <h3 className={styles.sessionTitle}>{formatDate(selectedSessionData.session_date)}</h3>
                  <div className={styles.sessionMeta}>
                    Driver: {getDriverName(selectedSessionData.driver_id)} | {selectedSessionData.entries?.length || 0} entries
                  </div>
                </div>
              </div>
              <div className={styles.entriesList}>
                {selectedSessionData.entries
                  ?.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                  .map((entry) => (
                    <div key={entry.id} className={styles.entryItem}>
                      <span className={`${styles.entryType} ${styles[entry.entry_type]}`}>{entry.entry_type}</span>
                      <div className={styles.entryInfo}>
                        <div className={styles.entryLocation}>
                          {entry.location_name || (entry.entry_type === 'start' ? 'Truck Start' : entry.entry_type === 'end' ? 'Day End' : `Stop #${entry.stop_number}`)}
                        </div>
                        {entry.notes && <div className={styles.entryNotes}>{entry.notes}</div>}
                      </div>
                      <div className={`${styles.entryTemp} ${entry.temperature > 40 ? styles.warning : ''}`}>
                        {entry.temperature}°F
                      </div>
                      <div className={styles.entryTime}>{formatTime(entry.timestamp)}</div>
                      {entry.photo_url && (
                        <img
                          src={entry.photo_url}
                          alt="Temperature reading"
                          className={styles.entryPhoto}
                          onClick={() => setModalPhoto(entry.photo_url)}
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Photo Modal */}
      {modalPhoto && (
        <div className={styles.photoModal} onClick={() => setModalPhoto(null)}>
          <img src={modalPhoto} alt="Temperature reading" />
        </div>
      )}
    </div>
    </AdminShell>
  );
}
