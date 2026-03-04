'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from '../admin.module.css';

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
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

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'admin',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/admins', {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      if (result.data) {
        setAdmins(result.data);
      }
    } catch (err) {
      console.error('Error loading admins:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...formData,
          generatePassword: true,
        }),
      });
      const result = await res.json();
      if (result.data) {
        setAdmins([result.data, ...admins]);
        setShowAddModal(false);
        setFormData({ name: '', email: '', role: 'admin' });
        if (result.generatedPassword) {
          setGeneratedPassword(result.generatedPassword);
        }
      } else {
        alert(result.error || 'Failed to create admin');
      }
    } catch (err) {
      console.error('Error creating admin:', err);
      alert('Failed to create admin');
    }
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    try {
      const res = await fetch('/api/admin/admins', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: editingAdmin.id,
          name: formData.name,
          role: formData.role,
        }),
      });
      const result = await res.json();
      if (result.data) {
        setAdmins(admins.map(a => a.id === result.data.id ? result.data : a));
        setEditingAdmin(null);
        setFormData({ name: '', email: '', role: 'admin' });
      } else {
        alert(result.error || 'Failed to update admin');
      }
    } catch (err) {
      console.error('Error updating admin:', err);
      alert('Failed to update admin');
    }
  };

  const handleToggleActive = async (admin: Admin) => {
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: admin.id,
          is_active: !admin.is_active,
        }),
      });
      const result = await res.json();
      if (result.data) {
        setAdmins(admins.map(a => a.id === result.data.id ? result.data : a));
      }
    } catch (err) {
      console.error('Error toggling admin status:', err);
    }
  };

  const handleResetPassword = async (admin: Admin) => {
    if (!confirm(`Reset password for ${admin.name}?`)) return;

    try {
      const res = await fetch('/api/admin/admins', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: admin.id,
          resetPassword: true,
        }),
      });
      const result = await res.json();
      if (result.generatedPassword) {
        setGeneratedPassword(result.generatedPassword);
      }
    } catch (err) {
      console.error('Error resetting password:', err);
      alert('Failed to reset password');
    }
  };

  const handleDelete = async (admin: Admin) => {
    if (!confirm(`Delete admin ${admin.name}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/admins?id=${admin.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setAdmins(admins.filter(a => a.id !== admin.id));
      } else {
        const result = await res.json();
        alert(result.error || 'Failed to delete admin');
      }
    } catch (err) {
      console.error('Error deleting admin:', err);
      alert('Failed to delete admin');
    }
  };

  const openEditModal = (admin: Admin) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name,
      email: admin.email,
      role: admin.role,
    });
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingAdmin(null);
    setFormData({ name: '', email: '', role: 'admin' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <AdminShell title="Admin Users">
      <div className={styles.pageContent}>
        {/* Password display modal */}
        {generatedPassword && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <h3>Generated Password</h3>
              <p>Copy this password now. It will not be shown again.</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                <code style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f3f4f6',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontFamily: 'monospace'
                }}>
                  {generatedPassword}
                </code>
                <button
                  className={styles.btnPrimary}
                  onClick={() => copyToClipboard(generatedPassword)}
                >
                  Copy
                </button>
              </div>
              <button
                className={styles.btnSecondary}
                onClick={() => setGeneratedPassword(null)}
                style={{ marginTop: '16px', width: '100%' }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Add/Edit modal */}
        {(showAddModal || editingAdmin) && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <h3>{editingAdmin ? 'Edit Admin' : 'Add Admin'}</h3>
              <form onSubmit={editingAdmin ? handleUpdateAdmin : handleCreateAdmin}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Name</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                {!editingAdmin && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Email</label>
                    <input
                      type="email"
                      className={styles.formInput}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                )}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Role</label>
                  <select
                    className={styles.formInput}
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button type="submit" className={styles.btnPrimary}>
                    {editingAdmin ? 'Update' : 'Create'}
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
          <h2>Admin Users</h2>
          <button className={styles.btnPrimary} onClick={() => setShowAddModal(true)}>
            + Add Admin
          </button>
        </div>

        {/* Admin list */}
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
          </div>
        ) : admins.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No admins found. Create your first admin to get started.</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td>{admin.name}</td>
                    <td>{admin.email}</td>
                    <td>
                      <span className={`${styles.badge} ${admin.role === 'super_admin' ? styles.badgePrimary : styles.badgeSecondary}`}>
                        {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${admin.is_active ? styles.active : styles.inactive}`}>
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {admin.last_login
                        ? new Date(admin.last_login).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          className={styles.btnSmall}
                          onClick={() => openEditModal(admin)}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.btnSmall}
                          onClick={() => handleResetPassword(admin)}
                        >
                          Reset PW
                        </button>
                        <button
                          className={`${styles.btnSmall} ${admin.is_active ? styles.btnDanger : styles.btnSuccess}`}
                          onClick={() => handleToggleActive(admin)}
                        >
                          {admin.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className={`${styles.btnSmall} ${styles.btnDanger}`}
                          onClick={() => handleDelete(admin)}
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
