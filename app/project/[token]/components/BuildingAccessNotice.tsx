'use client';

import { useState, useEffect } from 'react';
import { WhatsThisLink } from '@/components/WhatsThisLink';
import { updateTask } from '@/lib/data/tasks';
import type { TaskData } from './ProjectContent';
import styles from '../project.module.css';

interface BuildingAccessNoticeProps {
  tasks: TaskData[];
  onRefresh: () => void;
  globalDocuments?: Record<string, { url: string; label?: string }>;
  readOnly?: boolean;
  subtitle?: string;
  coiDocument?: {
    url: string;
    label: string;
  } | null;
}

interface CoiFormData {
  buildingName: string;
  careOf: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

// Clipboard icon
const ClipboardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

// Document icon
const DocumentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
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

export function BuildingAccessNotice({
  tasks = [],
  onRefresh,
  readOnly = false,
  subtitle = 'Please complete the following items for building access:',
  coiDocument = null,
}: BuildingAccessNoticeProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [coiForm, setCoiForm] = useState<CoiFormData>({
    buildingName: '',
    careOf: '',
    street: '',
    city: '',
    state: '',
    zip: '',
  });

  // Filter to only PM-actionable tasks (including text input tasks)
  const pmTasks = tasks.filter((t) => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'));

  // Initialize text values from tasks
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    tasks.forEach((t) => {
      if (t.label.startsWith('[PM-TEXT]')) {
        if (t.pm_text_value) {
          try {
            const parsed = JSON.parse(t.pm_text_value);
            if (parsed.buildingName) {
              setCoiForm(parsed);
            }
          } catch {
            initialValues[t.id] = t.pm_text_value || '';
          }
        }
      }
    });
    setTextValues(initialValues);
  }, [tasks]);

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

  const handleCoiFormComplete = async (task: TaskData) => {
    if (readOnly) {
      showReadOnlyMessage();
      return;
    }
    if (!coiForm.buildingName.trim() || updating) return;
    setUpdating(task.id);
    try {
      await updateTask(task.id, { completed: true, pm_text_value: JSON.stringify(coiForm) });
      onRefresh();
    } catch (err) {
      console.error('Error updating task:', err);
      alert('Error saving COI form: ' + (err as Error).message);
    } finally {
      setUpdating(null);
    }
  };

  const handleTextTaskComplete = async (task: TaskData) => {
    if (readOnly) {
      showReadOnlyMessage();
      return;
    }
    const textValue = textValues[task.id];
    if (!textValue || !textValue.trim() || updating) return;
    setUpdating(task.id);
    try {
      await updateTask(task.id, { completed: true, pm_text_value: textValue.trim() });
      onRefresh();
    } catch (err) {
      console.error('Error updating task:', err);
      alert('Error saving: ' + (err as Error).message);
    } finally {
      setUpdating(null);
    }
  };

  const formatCoiDisplay = (pmTextValue: string): string[] => {
    try {
      const data = JSON.parse(pmTextValue);
      const lines: string[] = [];
      if (data.buildingName) lines.push(data.buildingName);
      if (data.careOf) lines.push(`c/o ${data.careOf}`);
      const addressParts = [data.street, data.city, data.state, data.zip].filter(Boolean);
      if (addressParts.length > 0) {
        lines.push(
          `${data.street || ''}, ${data.city || ''}, ${data.state || ''} ${data.zip || ''}`.replace(
            /^, |, $|, ,/g,
            ''
          )
        );
      }
      return lines;
    } catch {
      return [pmTextValue];
    }
  };

  const getTaskLabel = (label: string) => {
    return label.replace('[PM] ', '').replace('[PM-TEXT] ', '');
  };

  const getPromptForTask = (task: TaskData) => {
    return `Click here once ${getTaskLabel(task.label).toLowerCase()}`;
  };

  if (pmTasks.length === 0) return null;

  return (
    <div className={styles.buildingAccessNotice}>
      <div className={styles.noticeHeader}>
        <ClipboardIcon />
        <span>Property Manager Action Items</span>
      </div>
      <p>{subtitle}</p>

      <div className={styles.pmActionItems}>
        {pmTasks.map((task, idx) => {
          const prevTask = idx > 0 ? pmTasks[idx - 1] : null;
          const isDisabled = prevTask && !prevTask.completed;
          const isClickable = !readOnly && !isDisabled;
          const isTextTask = task.label.startsWith('[PM-TEXT]');

          // Text input task (COI form)
          if (isTextTask) {
            const isCoiTask = task.label.toLowerCase().includes('coi') || task.label.toLowerCase().includes('insured');
            const canSubmit = isCoiTask ? coiForm.buildingName.trim() : textValues[task.id]?.trim();

            return (
              <div
                key={task.id}
                className={`${styles.pmActionItem} ${styles.pmActionItemAccess} ${styles.pmTextTask} ${task.completed ? styles.pmActionItemCompleted : ''} ${isDisabled ? styles.pmActionItemDisabled : ''}`}
              >
                <div
                  className={`${styles.pmCheckbox} ${task.completed ? styles.pmCheckboxChecked : ''}`}
                  onClick={() => {
                    if (readOnly) {
                      showReadOnlyMessage();
                      return;
                    }
                    if (isClickable && !task.completed && canSubmit) {
                      isCoiTask ? handleCoiFormComplete(task) : handleTextTaskComplete(task);
                    }
                  }}
                >
                  {task.completed && <SmallCheckIcon />}
                </div>
                <div className={styles.pmTextTaskContent}>
                  <span className={styles.pmActionLabel}>{getTaskLabel(task.label)}</span>
                  {!task.completed ? (
                    isCoiTask ? (
                      <div className={styles.coiForm}>
                        <input
                          type="text"
                          className={styles.coiFormInput}
                          placeholder="Building name"
                          value={coiForm.buildingName}
                          onChange={(e) => setCoiForm({ ...coiForm, buildingName: e.target.value })}
                          disabled={!!isDisabled}
                        />
                        <input
                          type="text"
                          className={styles.coiFormInput}
                          placeholder="c/o (building owner)"
                          value={coiForm.careOf}
                          onChange={(e) => setCoiForm({ ...coiForm, careOf: e.target.value })}
                          disabled={!!isDisabled}
                        />
                        <input
                          type="text"
                          className={styles.coiFormInput}
                          placeholder="Street address"
                          value={coiForm.street}
                          onChange={(e) => setCoiForm({ ...coiForm, street: e.target.value })}
                          disabled={!!isDisabled}
                        />
                        <div className={styles.coiFormRow}>
                          <input
                            type="text"
                            className={`${styles.coiFormInput} ${styles.coiCity}`}
                            placeholder="City"
                            value={coiForm.city}
                            onChange={(e) => setCoiForm({ ...coiForm, city: e.target.value })}
                            disabled={!!isDisabled}
                          />
                          <input
                            type="text"
                            className={`${styles.coiFormInput} ${styles.coiState}`}
                            placeholder="State"
                            value={coiForm.state}
                            onChange={(e) => setCoiForm({ ...coiForm, state: e.target.value })}
                            disabled={!!isDisabled}
                          />
                          <input
                            type="text"
                            className={`${styles.coiFormInput} ${styles.coiZip}`}
                            placeholder="ZIP"
                            value={coiForm.zip}
                            onChange={(e) => setCoiForm({ ...coiForm, zip: e.target.value })}
                            disabled={!!isDisabled}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className={styles.pmTextInputWrapper}>
                        <input
                          type="text"
                          className={styles.pmTextInlineInput}
                          placeholder="Enter response"
                          value={textValues[task.id] || ''}
                          onChange={(e) => setTextValues({ ...textValues, [task.id]: e.target.value })}
                          disabled={!!isDisabled}
                        />
                        {task.label.toLowerCase().includes('banner') && (
                          <WhatsThisLink
                            text='Raptor Vending uses retractable banners (33" x 81") to announce the upcoming food program to employees before machines arrive. This builds awareness and excitement. Please confirm if banner placement is allowed on-site (e.g. "Yes" or "No - lobby only").'
                            imageUrl="/banner-example.jpg"
                          />
                        )}
                      </div>
                    )
                  ) : (
                    <div className={styles.pmTextValue}>
                      {formatCoiDisplay(task.pm_text_value || '').map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Regular PM task
          return (
            <div
              key={task.id}
              className={`${styles.pmActionItem} ${styles.pmActionItemAccess} ${task.completed ? styles.pmActionItemCompleted : ''} ${isDisabled ? styles.pmActionItemDisabled : ''}`}
              onClick={() => {
                if (readOnly) {
                  showReadOnlyMessage();
                  return;
                }
                if (isClickable && !task.completed) handleTaskToggle(task);
              }}
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

      {/* COI Document Download - shown when admin uploads the certificate */}
      {coiDocument && coiDocument.url && (
        <div className={styles.coiDocumentDownload}>
          <div className={styles.coiDocumentHeader}>
            <DocumentIcon />
            <span>Certificate of Insurance</span>
          </div>
          <a href={coiDocument.url} target="_blank" rel="noopener noreferrer" className={styles.coiDownloadBtn}>
            <DownloadIcon />
            Download COI
          </a>
        </div>
      )}
    </div>
  );
}
