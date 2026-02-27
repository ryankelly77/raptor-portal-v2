'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '../editor.module.css';

interface Equipment {
  id: string;
  project_id: string;
  name: string;
  model: string | null;
  spec: string | null;
  status: string;
  status_label: string | null;
  sort_order: number;
}

interface EquipmentManagerProps {
  projectId: string;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'fabricating', label: 'Fabricating' },
  { value: 'ready', label: 'Ready for Delivery' },
  { value: 'in-transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'installed', label: 'Installed' },
];

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function EquipmentManager({ projectId }: EquipmentManagerProps) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', model: '', spec: '', status: 'pending', status_label: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', model: '', spec: '', status: 'pending' });

  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'equipment',
          action: 'read',
          filters: { project_id: projectId },
        }),
      });
      const result = await response.json();
      if (result.data) {
        setEquipment(result.data);
      }
    } catch (err) {
      console.error('Error loading equipment:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  async function handleCreate() {
    if (!newForm.name.trim()) return;
    try {
      const statusOption = STATUS_OPTIONS.find((o) => o.value === newForm.status);
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'equipment',
          action: 'create',
          data: {
            project_id: projectId,
            name: newForm.name,
            model: newForm.model || null,
            spec: newForm.spec || null,
            status: newForm.status,
            status_label: statusOption?.label || newForm.status,
            sort_order: equipment.length + 1,
          },
        }),
      });
      setNewForm({ name: '', model: '', spec: '', status: 'pending' });
      setShowAddForm(false);
      await loadEquipment();
    } catch (err) {
      alert('Error creating equipment: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdate(id: string) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'equipment',
          action: 'update',
          id,
          data: {
            name: editForm.name,
            model: editForm.model || null,
            spec: editForm.spec || null,
            status: editForm.status,
            status_label: editForm.status_label || editForm.status,
          },
        }),
      });
      setEditingId(null);
      await loadEquipment();
    } catch (err) {
      alert('Error updating equipment: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this equipment item?')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'equipment',
          action: 'delete',
          id,
        }),
      });
      await loadEquipment();
    } catch (err) {
      alert('Error deleting equipment: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  function startEditing(item: Equipment) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      model: item.model || '',
      spec: item.spec || '',
      status: item.status,
      status_label: item.status_label || '',
    });
  }

  function getStatusClass(status: string) {
    switch (status) {
      case 'pending':
        return styles.pending;
      case 'fabricating':
        return styles.fabricating;
      case 'ready':
        return styles.ready;
      case 'in-transit':
        return styles.inTransit;
      case 'delivered':
        return styles.delivered;
      case 'installed':
        return styles.installed;
      default:
        return '';
    }
  }

  if (loading) {
    return (
      <div className={styles.editorCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Equipment</h3>
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
        <h3 className={styles.cardTitle}>Equipment</h3>
        <button className={styles.btnPrimary} onClick={() => setShowAddForm(true)}>
          + Add Equipment
        </button>
      </div>
      <div className={styles.cardBody}>
        {/* Add Form */}
        {showAddForm && (
          <div className={styles.equipmentItem} style={{ background: '#fff7ed' }}>
            <div style={{ flex: 1, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                className={styles.formInput}
                placeholder="Name *"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                style={{ flex: 1, minWidth: '150px' }}
              />
              <input
                className={styles.formInput}
                placeholder="Model"
                value={newForm.model}
                onChange={(e) => setNewForm({ ...newForm, model: e.target.value })}
                style={{ width: '120px' }}
              />
              <input
                className={styles.formInput}
                placeholder="Spec"
                value={newForm.spec}
                onChange={(e) => setNewForm({ ...newForm, spec: e.target.value })}
                style={{ width: '120px' }}
              />
              <select
                className={styles.formSelect}
                value={newForm.status}
                onChange={(e) => setNewForm({ ...newForm, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.btnGroup}>
              <button className={styles.btnSave} onClick={handleCreate}>
                Add
              </button>
              <button className={styles.btnCancel} onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Equipment List */}
        {equipment.map((item) =>
          editingId === item.id ? (
            <div key={item.id} className={styles.equipmentItem} style={{ background: '#fff7ed' }}>
              <div style={{ flex: 1, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  className={styles.formInput}
                  placeholder="Name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ flex: 1, minWidth: '150px' }}
                />
                <input
                  className={styles.formInput}
                  placeholder="Model"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  style={{ width: '120px' }}
                />
                <input
                  className={styles.formInput}
                  placeholder="Spec"
                  value={editForm.spec}
                  onChange={(e) => setEditForm({ ...editForm, spec: e.target.value })}
                  style={{ width: '120px' }}
                />
                <select
                  className={styles.formSelect}
                  value={editForm.status}
                  onChange={(e) => {
                    const opt = STATUS_OPTIONS.find((o) => o.value === e.target.value);
                    setEditForm({
                      ...editForm,
                      status: e.target.value,
                      status_label: opt?.label || '',
                    });
                  }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.btnGroup}>
                <button className={styles.btnSave} onClick={() => handleUpdate(item.id)}>
                  Save
                </button>
                <button className={styles.btnCancel} onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={item.id} className={styles.equipmentItem}>
              <div className={styles.equipmentInfo}>
                <strong>{item.name}</strong>
                <span>
                  {item.model || 'No model'} | {item.spec || 'No spec'}
                </span>
              </div>
              <span className={`${styles.equipmentStatus} ${getStatusClass(item.status)}`}>
                {item.status_label || item.status}
              </span>
              <div className={styles.equipmentActions}>
                <button className={styles.btnEditSmall} onClick={() => startEditing(item)}>
                  Edit
                </button>
                <button className={styles.btnDeleteSmall} onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {equipment.length === 0 && !showAddForm && (
          <div className={styles.emptyState}>No equipment added yet.</div>
        )}
      </div>
    </div>
  );
}
