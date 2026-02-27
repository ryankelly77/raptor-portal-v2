'use client';

import { CheckIcon } from '@/components/icons';
import { EnclosureInfoBox } from './EnclosureInfoBox';
import type { TaskData } from './ProjectContent';
import styles from '../project.module.css';

interface TaskItemProps {
  task: TaskData;
  globalDocuments?: Record<string, { url: string; label?: string }>;
  readOnly?: boolean;
}

// Warning triangle icon
const WarningIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export function TaskItem({ task, readOnly = false }: TaskItemProps) {
  // Hide ADMIN-DOC tasks until document is uploaded
  if (task.label.startsWith('[ADMIN-DOC]') && !task.document_url) {
    return null;
  }

  // Hide PM tasks from regular task list (shown in PM Action Items section)
  if (task.label.startsWith('[PM-TEXT]') || task.label.startsWith('[PM]')) {
    return null;
  }

  // Clean up label by removing prefixes
  let displayLabel = task.label
    .replace('[PM] ', '')
    .replace('[PM-DATE] ', '')
    .replace('[PM-TEXT] ', '')
    .replace('[ADMIN-DATE] ', '')
    .replace('[ADMIN-SPEED] ', '')
    .replace('[ADMIN-ENCLOSURE] ', '')
    .replace('[ADMIN-EQUIPMENT] ', '')
    .replace('[ADMIN-DELIVERY] ', '')
    .replace('[ADMIN-DOC] ', '');

  // Handle equipment task
  const isAdminEquipment = task.label.startsWith('[ADMIN-EQUIPMENT]');
  if (isAdminEquipment && (task.smartfridge_qty || task.smartcooker_qty)) {
    const parts: string[] = [];
    if (task.smartfridge_qty && task.smartfridge_qty > 0) {
      parts.push(`(${task.smartfridge_qty}) SmartFridge™`);
    }
    if (task.smartcooker_qty && task.smartcooker_qty > 0) {
      parts.push(`(${task.smartcooker_qty}) SmartCooker™`);
    }
    if (parts.length > 0) {
      displayLabel = parts.join(' and ') + ' ordered';
    }
  }

  // Handle delivery task
  const isAdminDelivery = task.label.startsWith('[ADMIN-DELIVERY]');
  const deliveries = task.deliveries || [];
  const hasDeliveryData = isAdminDelivery && deliveries.length > 0;

  // Handle admin date task
  const isAdminDate = task.label.startsWith('[ADMIN-DATE]');
  if (isAdminDate) {
    if (task.scheduled_date) {
      const date = new Date(task.scheduled_date + 'T00:00:00');
      const formatted = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      displayLabel = displayLabel + ' — ' + formatted;
    } else {
      displayLabel = displayLabel + ' — Pending';
    }
  }

  // Handle admin speed task
  const isAdminSpeed = task.label.startsWith('[ADMIN-SPEED]');
  const hasSpeedData = isAdminSpeed && (task.upload_speed || task.download_speed);
  const uploadBelowMin = task.upload_speed && parseFloat(task.upload_speed) < 10;
  const downloadBelowMin = task.download_speed && parseFloat(task.download_speed) < 10;
  const speedWarning = hasSpeedData && (uploadBelowMin || downloadBelowMin);

  // Handle admin enclosure task
  const isAdminEnclosure = task.label.startsWith('[ADMIN-ENCLOSURE]');
  const hasEnclosureData = isAdminEnclosure && task.enclosure_type;
  const isCustomColor = task.enclosure_type === 'custom' && task.enclosure_color === 'other';

  // Handle admin doc task
  const isAdminDoc = task.label.startsWith('[ADMIN-DOC]');
  const hasDocData = isAdminDoc && task.document_url;
  const isCOITask = isAdminDoc && task.label.toLowerCase().includes('coi');

  // For COI tasks with document, replace the label
  if (isCOITask && hasDocData) {
    displayLabel = 'Download Certificate of Insurance (COI)';
  }

  const getEnclosureLabel = (): string | null => {
    if (!task.enclosure_type) return null;
    if (task.enclosure_type === 'wrap') return 'Magnetic Wrap';
    if (task.enclosure_type === 'custom') {
      const colorLabels: Record<string, string> = {
        dove_grey: 'Dove Grey',
        macchiato: 'Macchiato',
        black: 'Black',
        other: task.custom_color_name || 'Custom Color',
      };
      return `Custom Architectural Enclosure — ${colorLabels[task.enclosure_color || ''] || 'Color TBD'}`;
    }
    return null;
  };

  const hasDetailBox = isAdminSpeed || isAdminEnclosure || hasDeliveryData;

  const showReadOnlyMessage = () => {
    alert('Only Property Managers or Raptor Vending can access these documents.');
  };

  return (
    <div
      className={`${styles.subtask} ${task.completed ? styles.subtaskCompleted : ''} ${hasDetailBox ? styles.subtaskHasDetail : ''}`}
    >
      <div
        className={`${styles.subtaskCheckbox} ${task.completed ? styles.subtaskCheckboxCompleted : styles.subtaskCheckboxPending}`}
      >
        {task.completed && <CheckIcon />}
      </div>
      <div className={styles.subtaskContent}>
        <span className={styles.subtaskLabel}>
          {isCOITask && hasDocData ? (
            readOnly ? (
              <span className={styles.coiDownloadLink} style={{ cursor: 'pointer' }} onClick={showReadOnlyMessage}>
                {displayLabel}
              </span>
            ) : (
              <a href={task.document_url!} target="_blank" rel="noopener noreferrer" className={styles.coiDownloadLink}>
                {displayLabel}
              </a>
            )
          ) : (
            displayLabel
          )}
          {isAdminSpeed && !hasSpeedData && !task.completed && (
            <span className={styles.speedPending}> — Pending</span>
          )}
          {isAdminEnclosure && !hasEnclosureData && !task.completed && (
            <span className={styles.speedPending}> — Pending</span>
          )}
          {hasDocData && !isCOITask && (
            readOnly ? (
              <span className={styles.taskDocLink} style={{ cursor: 'pointer' }} onClick={showReadOnlyMessage}>
                (View Document)
              </span>
            ) : (
              <a href={task.document_url!} target="_blank" rel="noopener noreferrer" className={styles.taskDocLink}>
                (View Document)
              </a>
            )
          )}
        </span>

        {/* Speed Results */}
        {hasSpeedData && (
          <div className={`${styles.speedResultsBox} ${speedWarning ? styles.speedResultsBoxWarning : styles.speedResultsBoxSuccess}`}>
            <div className={styles.speedValues}>
              <div className={styles.speedValue}>
                <span className={styles.speedLabel}>Upload:</span>
                <span className={`${styles.speedNumber} ${uploadBelowMin ? styles.speedNumberBelowMin : ''}`}>
                  {task.upload_speed || '—'} Mbps
                </span>
              </div>
              <div className={styles.speedValue}>
                <span className={styles.speedLabel}>Download:</span>
                <span className={`${styles.speedNumber} ${downloadBelowMin ? styles.speedNumberBelowMin : ''}`}>
                  {task.download_speed || '—'} Mbps
                </span>
              </div>
            </div>
            {speedWarning && (
              <div className={styles.speedWarning}>
                <WarningIcon />
                <span>
                  One or more of the speed tests did not meet the minimum requirements of 10Mbps. A network drop or
                  WiFi with QoS (Quality of Service) may be required.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Enclosure Info */}
        {hasEnclosureData && (
          <EnclosureInfoBox
            enclosureLabel={getEnclosureLabel()}
            enclosureType={task.enclosure_type!}
            isCustomColor={isCustomColor}
          />
        )}

        {/* Delivery Info */}
        {hasDeliveryData && (
          <div className={styles.deliveryResultsBox}>
            {deliveries
              .filter((d) => d.equipment)
              .map((delivery, idx) => (
                <div key={idx} className={styles.deliveryItem}>
                  <div className={styles.deliveryEquipment}>{delivery.equipment}</div>
                  <div className={styles.deliveryValues}>
                    {delivery.date && (
                      <div className={styles.deliveryValue}>
                        <span className={styles.deliveryLabel}>Date:</span>
                        <span className={styles.deliveryData}>
                          {new Date(delivery.date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                    {delivery.carrier && (
                      <div className={styles.deliveryValue}>
                        <span className={styles.deliveryLabel}>Carrier:</span>
                        <span className={styles.deliveryData}>{delivery.carrier}</span>
                      </div>
                    )}
                    {delivery.tracking && (
                      <div className={styles.deliveryValue}>
                        <span className={styles.deliveryLabel}>Tracking #:</span>
                        <span className={styles.deliveryData}>{delivery.tracking}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            <div className={styles.deliveryNote}>
              Note: the equipment delivery date may not be the same date as the official install of the equipment. See
              System Installation below.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
