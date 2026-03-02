'use client';

import { useState, useRef } from 'react';
import { uploadFile } from '@/lib/api/admin';
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

interface Delivery {
  equipment: string;
  date: string;
  carrier: string;
  tracking: string;
  notified?: boolean;
}

interface TaskEditorProps {
  task: Task;
  projectId: string;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

// Equipment types for delivery dropdown
const EQUIPMENT_TYPES = ['SmartFridge', 'SmartCooker', 'Fixturelite', 'Mag Wrap'];

export function TaskEditor({ task, projectId, onUpdate, onDelete }: TaskEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(task.label);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Determine task type from prefix
  const isAdminDate = task.label.startsWith('[ADMIN-DATE]');
  const isAdminSpeed = task.label.startsWith('[ADMIN-SPEED]');
  const isAdminEnclosure = task.label.startsWith('[ADMIN-ENCLOSURE]');
  const isAdminEquipment = task.label.startsWith('[ADMIN-EQUIPMENT]');
  const isAdminDelivery = task.label.startsWith('[ADMIN-DELIVERY]');
  const isAdminDoc = task.label.startsWith('[ADMIN-DOC]');
  const isPmText = task.label.startsWith('[PM-TEXT]');
  const isPmDate = task.label.startsWith('[PM-DATE]');
  const isPm = task.label.startsWith('[PM]') || isPmDate || isPmText;

  // Get display label (remove prefix)
  const displayLabel = task.label
    .replace('[ADMIN-DATE] ', '')
    .replace('[ADMIN-SPEED] ', '')
    .replace('[ADMIN-ENCLOSURE] ', '')
    .replace('[ADMIN-EQUIPMENT] ', '')
    .replace('[ADMIN-DELIVERY] ', '')
    .replace('[ADMIN-DOC] ', '')
    .replace('[PM] ', '')
    .replace('[PM-DATE] ', '')
    .replace('[PM-TEXT] ', '');

  async function handleSaveLabel() {
    if (!editLabel.trim()) return;
    await onUpdate(task.id, { label: editLabel.trim() });
    setEditing(false);
  }

  async function handleToggleCompleted() {
    await onUpdate(task.id, { completed: !task.completed });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `task-${task.id}-${Date.now()}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const publicUrl = await uploadFile('project-files', filePath, file);
      await onUpdate(task.id, { document_url: publicUrl });
    } catch (err) {
      alert('Error uploading file: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.taskItem}>
      <input type="checkbox" checked={task.completed} onChange={handleToggleCompleted} disabled={editing} />

      {editing ? (
        <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
          <input
            className={styles.formInput}
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveLabel();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
          />
          <button className={styles.btnSave} onClick={handleSaveLabel}>
            ✓
          </button>
          <button className={styles.btnCancel} onClick={() => setEditing(false)}>
            ✗
          </button>
        </div>
      ) : (
        <>
          <span className={`${styles.taskLabel} ${task.completed ? styles.completed : ''}`}>
            {isPm && <span className={styles.pmBadge}>PM</span>}
            {displayLabel}
          </span>
          <div className={styles.taskActions}>
            <button className={styles.btnEditSmall} onClick={() => setEditing(true)}>
              ✎
            </button>
            <button className={styles.btnDeleteSmall} onClick={() => onDelete(task.id)}>
              ×
            </button>
          </div>
        </>
      )}

      {/* Admin Date Input */}
      {isAdminDate && !editing && (
        <input
          type="date"
          className={styles.formInput}
          style={{ width: '150px', marginLeft: '8px' }}
          value={task.scheduled_date || ''}
          onChange={(e) => onUpdate(task.id, { scheduled_date: e.target.value || null })}
        />
      )}

      {/* Admin Speed Inputs */}
      {isAdminSpeed && !editing && (
        <SpeedInputs task={task} onUpdate={onUpdate} />
      )}

      {/* Admin Enclosure Inputs */}
      {isAdminEnclosure && !editing && (
        <EnclosureInputs task={task} onUpdate={onUpdate} />
      )}

      {/* Admin Equipment Inputs */}
      {isAdminEquipment && !editing && (
        <EquipmentQtyInputs task={task} onUpdate={onUpdate} />
      )}

      {/* Admin Delivery Inputs */}
      {isAdminDelivery && !editing && (
        <DeliveryInputs task={task} projectId={projectId} onUpdate={onUpdate} />
      )}

      {/* Admin Document Upload */}
      {isAdminDoc && task.completed && !editing && (
        <div style={{ marginLeft: '8px' }}>
          {task.document_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <a href={task.document_url} target="_blank" rel="noopener noreferrer" style={{ color: '#FF580F' }}>
                View Document
              </a>
              <button
                className={styles.btnDeleteSmall}
                onClick={() => onUpdate(task.id, { document_url: null })}
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
              />
              <button
                className={styles.btnSmall}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </>
          )}
        </div>
      )}

      {/* PM Text Inputs */}
      {isPmText && !editing && (
        <PmTextInput task={task} onUpdate={onUpdate} />
      )}
    </div>
  );
}

// Speed Inputs Component
function SpeedInputs({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}) {
  const [upload, setUpload] = useState(task.upload_speed || '');
  const [download, setDownload] = useState(task.download_speed || '');

  const uploadBelowMin = upload && parseFloat(upload) < 10;
  const downloadBelowMin = download && parseFloat(download) < 10;
  const showWarning = (upload || download) && (uploadBelowMin || downloadBelowMin);

  async function handleBlur(field: 'upload_speed' | 'download_speed', value: string) {
    const currentValue = field === 'upload_speed' ? task.upload_speed : task.download_speed;
    if (value !== (currentValue || '')) {
      await onUpdate(task.id, { [field]: value || null });
    }
  }

  return (
    <div className={styles.adminInputs} style={{ width: '100%', marginTop: '8px' }}>
      <div className={styles.inputGroup}>
        <label>Up:</label>
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="Mbps"
          value={upload}
          onChange={(e) => setUpload(e.target.value)}
          onBlur={() => handleBlur('upload_speed', upload)}
          className={uploadBelowMin ? styles.belowMin : ''}
          style={{ width: '80px' }}
        />
      </div>
      <div className={styles.inputGroup}>
        <label>Down:</label>
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="Mbps"
          value={download}
          onChange={(e) => setDownload(e.target.value)}
          onBlur={() => handleBlur('download_speed', download)}
          className={downloadBelowMin ? styles.belowMin : ''}
          style={{ width: '80px' }}
        />
      </div>
      {showWarning && (
        <div className={styles.speedWarning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Speed below 10Mbps minimum. A network drop or WiFi with QoS may be required.</span>
        </div>
      )}
    </div>
  );
}

// Enclosure Inputs Component
function EnclosureInputs({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}) {
  const [customColor, setCustomColor] = useState(task.custom_color_name || '');

  async function handleTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const updates: Partial<Task> = { enclosure_type: e.target.value || null };
    if (e.target.value !== 'custom') {
      updates.enclosure_color = null;
      updates.custom_color_name = null;
    }
    await onUpdate(task.id, updates);
  }

  async function handleColorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const updates: Partial<Task> = { enclosure_color: e.target.value || null };
    if (e.target.value !== 'other') {
      updates.custom_color_name = null;
      setCustomColor('');
    }
    await onUpdate(task.id, updates);
  }

  async function handleCustomColorBlur() {
    if (customColor !== (task.custom_color_name || '')) {
      await onUpdate(task.id, { custom_color_name: customColor || null });
    }
  }

  return (
    <div className={styles.adminInputs} style={{ width: '100%', marginTop: '8px' }}>
      <select value={task.enclosure_type || ''} onChange={handleTypeChange}>
        <option value="">Select type...</option>
        <option value="custom">Custom Architectural Enclosure</option>
        <option value="wrap">Magnetic Wrap</option>
      </select>
      {task.enclosure_type === 'custom' && (
        <select value={task.enclosure_color || ''} onChange={handleColorChange}>
          <option value="">Select color...</option>
          <option value="dove_grey">Dove Grey</option>
          <option value="macchiato">Macchiato</option>
          <option value="black">Black</option>
          <option value="other">Other</option>
        </select>
      )}
      {task.enclosure_type === 'custom' && task.enclosure_color === 'other' && (
        <input
          type="text"
          placeholder="Enter color name..."
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          onBlur={handleCustomColorBlur}
        />
      )}
    </div>
  );
}

// Equipment Quantity Inputs
function EquipmentQtyInputs({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}) {
  return (
    <div className={styles.adminInputs} style={{ width: '100%', marginTop: '8px' }}>
      <div className={styles.inputGroup}>
        <label>SmartFridge:</label>
        <select
          value={task.smartfridge_qty || 0}
          onChange={(e) => onUpdate(task.id, { smartfridge_qty: parseInt(e.target.value) || 0 })}
        >
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.inputGroup}>
        <label>SmartCooker:</label>
        <select
          value={task.smartcooker_qty || 0}
          onChange={(e) => onUpdate(task.id, { smartcooker_qty: parseInt(e.target.value) || 0 })}
        >
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Delivery Inputs Component
function DeliveryInputs({
  task,
  projectId,
  onUpdate,
}: {
  task: Task;
  projectId: string;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}) {
  const deliveries = (task.deliveries as Delivery[]) || [];
  const [localDeliveries, setLocalDeliveries] = useState<Delivery[]>(deliveries);

  async function addDelivery() {
    const newDeliveries = [...localDeliveries, { equipment: '', date: '', carrier: '', tracking: '' }];
    setLocalDeliveries(newDeliveries);
    await onUpdate(task.id, { deliveries: newDeliveries });
  }

  function updateDelivery(index: number, field: keyof Delivery, value: string) {
    const newDeliveries = [...localDeliveries];
    newDeliveries[index] = { ...newDeliveries[index], [field]: value };
    setLocalDeliveries(newDeliveries);
  }

  async function saveDelivery(index: number) {
    await onUpdate(task.id, { deliveries: localDeliveries });
  }

  async function removeDelivery(index: number) {
    const newDeliveries = localDeliveries.filter((_, i) => i !== index);
    setLocalDeliveries(newDeliveries);
    await onUpdate(task.id, { deliveries: newDeliveries });
  }

  return (
    <div style={{ width: '100%', marginTop: '8px' }}>
      {localDeliveries.map((delivery, idx) => (
        <div key={idx} className={styles.deliveryRow}>
          <select
            value={delivery.equipment || ''}
            onChange={(e) => updateDelivery(idx, 'equipment', e.target.value)}
            onBlur={() => saveDelivery(idx)}
          >
            <option value="">Select equipment...</option>
            {EQUIPMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={delivery.date || ''}
            onChange={(e) => updateDelivery(idx, 'date', e.target.value)}
            onBlur={() => saveDelivery(idx)}
          />
          <input
            type="text"
            placeholder="Carrier"
            value={delivery.carrier || ''}
            onChange={(e) => updateDelivery(idx, 'carrier', e.target.value)}
            onBlur={() => saveDelivery(idx)}
          />
          <input
            type="text"
            placeholder="Tracking #"
            value={delivery.tracking || ''}
            onChange={(e) => updateDelivery(idx, 'tracking', e.target.value)}
            onBlur={() => saveDelivery(idx)}
          />
          <button className={styles.btnDeleteSmall} onClick={() => removeDelivery(idx)}>
            ×
          </button>
        </div>
      ))}
      <button className={styles.btnAddSmall} onClick={addDelivery}>
        + Add Delivery
      </button>
    </div>
  );
}

// PM Text Input Component
function PmTextInput({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}) {
  const [value, setValue] = useState(task.pm_text_response || '');

  async function handleBlur() {
    if (value !== (task.pm_text_response || '')) {
      await onUpdate(task.id, { pm_text_response: value || null });
    }
  }

  return (
    <div style={{ marginLeft: '8px', flex: 1 }}>
      <input
        type="text"
        className={styles.formInput}
        placeholder="PM response..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
}
