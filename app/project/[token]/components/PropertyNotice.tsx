'use client';

import { useState } from 'react';
import { updateTask } from '@/lib/data/tasks';
import type { TaskData } from './ProjectContent';
import styles from '../project.module.css';

interface PropertyNoticeProps {
  contractorInfo?: {
    name: string;
    scheduledDate: string | null;
    status?: string | null;
  } | null;
  tasks: TaskData[];
  onRefresh: () => void;
  document?: {
    url: string;
    label: string;
  } | null;
  globalDocuments?: Record<string, { url: string; label?: string }>;
  readOnly?: boolean;
}

// Clipboard icon
const ClipboardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

// Download icon
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

// Small check icon for checkbox
const SmallCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="14" height="14">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export function PropertyNotice({
  contractorInfo,
  tasks = [],
  onRefresh,
  document,
  globalDocuments,
  readOnly = false,
}: PropertyNoticeProps) {
  // Use global electrical specs if available, otherwise fall back to phase document
  const specsDoc = globalDocuments?.electrical_specs?.url ? globalDocuments.electrical_specs : document;

  const [showDatePicker, setShowDatePicker] = useState<string | false>(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  // Filter to only PM-actionable tasks, keeping original sort order
  const pmActionTasks = tasks.filter(
    (t) => t.label.startsWith('[PM]') || t.label.startsWith('[PM-DATE]') || t.label.startsWith('[PM-TEXT]')
  );

  const showReadOnlyMessage = () => {
    alert('Only Property Managers or Raptor Vending can complete tasks.');
  };

  const handleTaskToggle = async (task: TaskData) => {
    if (readOnly) {
      showReadOnlyMessage();
      return;
    }
    if (updating || task.completed) return;
    setUpdating(task.id);
    try {
      await updateTask(task.id, { completed: true });
      onRefresh();
    } catch (err) {
      console.error('Error updating task:', err);
      alert('Error updating task: ' + (err as Error).message);
    } finally {
      setUpdating(null);
    }
  };

  const handleDateTaskComplete = async (task: TaskData) => {
    if (!selectedDate || updating) return;
    setUpdating(task.id);
    try {
      await updateTask(task.id, { completed: true });
      onRefresh();
      setShowDatePicker(false);
    } catch (err) {
      console.error('Error updating task:', err);
    } finally {
      setUpdating(null);
    }
  };

  const getTaskLabel = (label: string) => {
    return label.replace('[PM] ', '').replace('[PM-DATE] ', '').replace('[PM-TEXT] ', '');
  };

  const getPromptForTask = (task: TaskData) => {
    return `Click here once ${getTaskLabel(task.label).toLowerCase()}`;
  };

  return (
    <div className={styles.propertyNotice}>
      <div className={styles.noticeHeader}>
        <ClipboardIcon />
        <span>Property Manager Action Items</span>
      </div>
      <p>
        Property is responsible for infrastructure preparation—dedicated 15A circuit for Smart Cooker™ and{' '}
        <strong>optional</strong> ethernet drops for real-time operations. We provide specifications; property team
        coordinates contractor quotes and installation.
      </p>

      {specsDoc?.url &&
        (readOnly ? (
          <span
            className={styles.specSheetBtn}
            style={{ cursor: 'pointer' }}
            onClick={() => alert('Only Property Managers or Raptor Vending can access these documents.')}
          >
            <DownloadIcon />
            Download the Electrical and Networking Specifications
          </span>
        ) : (
          <a href={specsDoc.url} target="_blank" rel="noopener noreferrer" className={styles.specSheetBtn}>
            <DownloadIcon />
            Download the Electrical and Networking Specifications
          </a>
        ))}

      {/* PM Action Items - rendered in database sort order */}
      <div className={styles.pmActionItems}>
        {pmActionTasks.map((task, idx) => {
          // Each task depends on the previous PM task being completed
          const prevTask = idx > 0 ? pmActionTasks[idx - 1] : null;
          const isDisabled = prevTask && !prevTask.completed;
          const isClickable = !readOnly && !isDisabled;
          const isDateTask = task.label.startsWith('[PM-DATE]');

          // Date task that needs date picker
          if (isDateTask && !task.completed) {
            if (showDatePicker === task.id) {
              return (
                <div key={task.id} className={styles.pmDatePicker}>
                  <label>Scheduled Installation Date:</label>
                  <div className={styles.pmDateInputRow}>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                    <button
                      className={styles.pmDateConfirm}
                      onClick={() => handleDateTaskComplete(task)}
                      disabled={!!isDisabled || !selectedDate || !!updating}
                    >
                      Confirm
                    </button>
                    <button className={styles.pmDateCancel} onClick={() => setShowDatePicker(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={task.id}
                className={`${styles.pmActionItem} ${styles.pmActionItemElectrical} ${isDisabled ? styles.pmActionItemDisabled : ''}`}
                onClick={() => isClickable && setShowDatePicker(task.id)}
              >
                <div className={styles.pmCheckbox}></div>
                <span className={styles.pmActionLabel}>{getPromptForTask(task)}</span>
              </div>
            );
          }

          // Regular PM task or completed date task
          return (
            <div
              key={task.id}
              className={`${styles.pmActionItem} ${styles.pmActionItemElectrical} ${task.completed ? styles.pmActionItemCompleted : ''} ${isDisabled ? styles.pmActionItemDisabled : ''}`}
              onClick={() => isClickable && !task.completed && handleTaskToggle(task)}
            >
              <div className={`${styles.pmCheckbox} ${task.completed ? styles.pmCheckboxChecked : ''}`}>
                {task.completed && <SmallCheckIcon />}
              </div>
              <span className={styles.pmActionLabel}>
                {task.completed ? getTaskLabel(task.label) : getPromptForTask(task)}
              </span>
            </div>
          );
        })}
      </div>

      {contractorInfo && (
        <div className={styles.contractorInfo}>
          <span className={styles.contractorLabel}>Selected Contractor:</span>
          <span className={styles.contractorName}>{contractorInfo.name}</span>
          <span className={styles.contractorDate}>Scheduled: {contractorInfo.scheduledDate}</span>
        </div>
      )}
    </div>
  );
}
