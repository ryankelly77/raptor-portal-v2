'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from '../admin.module.css';

interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  access_token: string;
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

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [showTokenModal, setShowTokenModal] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/drivers', {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      if (result.data) {
        setDrivers(result.data);
      }
    } catch (err) {
      console.error('Error loading drivers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      if (result.data) {
        setDrivers([result.data, ...drivers]);
        setShowAddModal(false);
        setFormData({ name: '', email: '', phone: '' });
        // Show the token modal
        setShowTokenModal(result.data.access_token);
      } else {
        alert(result.error || 'Failed to create driver');
      }
    } catch (err) {
      console.error('Error creating driver:', err);
      alert('Failed to create driver');
    }
  };

  const handleUpdateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;

    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: editingDriver.id,
          ...formData,
        }),
      });
      const result = await res.json();
      if (result.data) {
        setDrivers(drivers.map(d => d.id === result.data.id ? result.data : d));
        setEditingDriver(null);
        setFormData({ name: '', email: '', phone: '' });
      } else {
        alert(result.error || 'Failed to update driver');
      }
    } catch (err) {
      console.error('Error updating driver:', err);
      alert('Failed to update driver');
    }
  };

  const handleToggleActive = async (driver: Driver) => {
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: driver.id,
          is_active: !driver.is_active,
        }),
      });
      const result = await res.json();
      if (result.data) {
        setDrivers(drivers.map(d => d.id === result.data.id ? result.data : d));
      }
    } catch (err) {
      console.error('Error toggling driver status:', err);
    }
  };

  const handleRegenerateToken = async (driver: Driver) => {
    if (!confirm(`Regenerate access token for ${driver.name}? The old token will stop working.`)) return;

    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: driver.id,
          regenerateToken: true,
        }),
      });
      const result = await res.json();
      if (result.data) {
        setDrivers(drivers.map(d => d.id === result.data.id ? result.data : d));
        setShowTokenModal(result.data.access_token);
      }
    } catch (err) {
      console.error('Error regenerating token:', err);
      alert('Failed to regenerate token');
    }
  };

  const handleDelete = async (driver: Driver) => {
    if (!confirm(`Delete driver ${driver.name}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/drivers?id=${driver.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDrivers(drivers.filter(d => d.id !== driver.id));
      } else {
        const result = await res.json();
        alert(result.error || 'Failed to delete driver');
      }
    } catch (err) {
      console.error('Error deleting driver:', err);
      alert('Failed to delete driver');
    }
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name,
      email: driver.email,
      phone: driver.phone || '',
    });
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingDriver(null);
    setFormData({ name: '', email: '', phone: '' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <AdminShell title="Drivers">
      <div className={styles.pageContent}>
        {/* Token display modal */}
        {showTokenModal && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <h3>Driver Access Token</h3>
              <p>Share this token with the driver. They can use it to log in.</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                <code style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f3f4f6',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontFamily: 'monospace'
                }}>
                  {showTokenModal}
                </code>
                <button
                  className={styles.btnPrimary}
                  onClick={() => copyToClipboard(showTokenModal)}
                >
                  Copy
                </button>
              </div>
              <p style={{ marginTop: '16px', fontSize: '14px', color: '#6b7280' }}>
                Or, drivers can log in using their phone number (if provided) via SMS code.
              </p>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowTokenModal(null)}
                style={{ marginTop: '16px', width: '100%' }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Add/Edit modal */}
        {(showAddModal || editingDriver) && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <h3>{editingDriver ? 'Edit Driver' : 'Add Driver'}</h3>
              <form onSubmit={editingDriver ? handleUpdateDriver : handleCreateDriver}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Name *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    type="email"
                    className={styles.formInput}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone (for SMS login)</label>
                  <input
                    type="tel"
                    className={styles.formInput}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 555-5555"
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button type="submit" className={styles.btnPrimary}>
                    {editingDriver ? 'Update' : 'Create'}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Header */}
        <div className={styles.sectionHeader}>
          <h2>Drivers</h2>
          <button className={styles.btnPrimary} onClick={() => setShowAddModal(true)}>
            + Add Driver
          </button>
        </div>

        {/* Driver list */}
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
          </div>
        ) : drivers.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No drivers found. Create your first driver to get started.</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Access Token</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id}>
                    <td>{driver.name}</td>
                    <td>{driver.email || '-'}</td>
                    <td>{driver.phone || '-'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${driver.is_active ? styles.active : styles.inactive}`}>
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>
                        {driver.access_token.slice(0, 6)}...
                      </code>
                      <button
                        className={styles.btnSmall}
                        style={{ marginLeft: '8px' }}
                        onClick={() => copyToClipboard(driver.access_token)}
                      >
                        Copy
                      </button>
                    </td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          className={styles.btnSmall}
                          onClick={() => openEditModal(driver)}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.btnSmall}
                          onClick={() => handleRegenerateToken(driver)}
                        >
                          New Token
                        </button>
                        <button
                          className={`${styles.btnSmall} ${driver.is_active ? styles.btnDanger : styles.btnSuccess}`}
                          onClick={() => handleToggleActive(driver)}
                        >
                          {driver.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className={`${styles.btnSmall} ${styles.btnDanger}`}
                          onClick={() => handleDelete(driver)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
