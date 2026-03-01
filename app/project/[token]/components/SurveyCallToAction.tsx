'use client';

import { useState } from 'react';
import { WhatsThisLink } from '@/components/WhatsThisLink';
import { updateTask } from '@/lib/data/tasks';
import type { TaskData } from './ProjectContent';
import styles from '../project.module.css';

interface SurveyCallToActionProps {
  surveyToken?: string | null;
  surveyClicks?: number;
  surveyCompletions?: number;
  pmTask?: TaskData;
  pmTasks?: TaskData[];  // All PM tasks (for displaying multiple)
  pmTextTasks?: TaskData[];
  onTaskUpdate: () => void;
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

// Copy icon
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

// Check icon
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// Small check icon for checkbox
const SmallCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="14" height="14">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export function SurveyCallToAction({
  surveyToken,
  surveyClicks = 0,
  surveyCompletions = 0,
  pmTask,
  pmTasks = [],
  pmTextTasks = [],
  onTaskUpdate,
  readOnly = false,
}: SurveyCallToActionProps) {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});

  // Use pmTasks if provided, otherwise fall back to single pmTask for backwards compatibility
  const allPmTasks = pmTasks.length > 0 ? pmTasks : (pmTask ? [pmTask] : []);

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('[DEBUG] SurveyCallToAction received pmTasks:', pmTasks.length, pmTasks.map(t => t.label));
    console.log('[DEBUG] SurveyCallToAction allPmTasks:', allPmTasks.length, allPmTasks.map(t => t.label));
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const surveyUrl = surveyToken
    ? `${baseUrl}/survey/${surveyToken}`
    : 'https://raptor-vending.com/building-survey/';

  const handleCopy = async () => {
    if (readOnly) return;
    try {
      await navigator.clipboard.writeText(surveyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const showReadOnlyMessage = () => {
    alert('Only Property Managers or Raptor Vending can complete tasks.');
  };

  const handleTaskToggle = async (task: TaskData) => {
    if (readOnly) {
      showReadOnlyMessage();
      return;
    }
    if (!task || updating || task.completed) return;
    setUpdating(task.id);
    try {
      await updateTask(task.id, { completed: true });
      onTaskUpdate();
    } catch (err) {
      console.error('Error updating task:', err);
    } finally {
      setUpdating(null);
    }
  };

  const getTaskLabel = (label: string) => {
    return label.replace('[PM] ', '').replace('[PM-TEXT] ', '');
  };

  const getPromptForTask = (task: TaskData) => {
    const label = getTaskLabel(task.label);
    // Special case for the default survey distribution task
    if (label.toLowerCase().includes('survey') && label.toLowerCase().includes('tenant')) {
      return "Click here once you've shared the survey with tenants";
    }
    // Lowercase only the first character to flow naturally after "Click here once"
    return `Click here once ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  };

  // Visible debug - shows task counts on page
  const debugInfo = typeof window !== 'undefined' ? `[Tasks: ${allPmTasks.length} PM, ${pmTextTasks.length} Text]` : '';

  return (
    <div className={styles.surveyCta}>
      <div className={styles.noticeHeader}>
        <ClipboardIcon />
        <span>Property Manager Action Items {debugInfo && <small style={{ color: '#999', fontWeight: 'normal' }}>{debugInfo}</small>}</span>
      </div>
      <div className={styles.surveyCtaContent}>
        <p>Copy this link and share with building tenants to capture their snack and meal preferences:</p>
        <div className={styles.surveyUrlField}>
          <input
            type="text"
            value={readOnly ? '(hidden)' : surveyUrl}
            readOnly
            style={readOnly ? { color: '#999', fontStyle: 'italic' } : {}}
          />
          <button
            className={styles.copyBtn}
            onClick={readOnly ? undefined : handleCopy}
            title="Copy to clipboard"
            disabled={readOnly}
            style={readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        {/* PM Action Items */}
        {allPmTasks.map((task) => (
          <div
            key={task.id}
            className={`${styles.pmActionItem} ${task.completed ? styles.pmActionItemCompleted : ''}`}
            onClick={() => handleTaskToggle(task)}
          >
            <div className={`${styles.pmCheckbox} ${task.completed ? styles.pmCheckboxChecked : ''}`}>
              {task.completed && <SmallCheckIcon />}
            </div>
            <span className={styles.pmActionLabel}>
              {task.completed ? getTaskLabel(task.label) : getPromptForTask(task)}
            </span>
          </div>
        ))}

        {/* PM-TEXT Action Items (like banner permission) */}
        {pmTextTasks.map((task) => {
          const displayLabel = task.label.replace('[PM-TEXT] ', '');
          const isBannerTask = task.label.toLowerCase().includes('banner');
          const canSubmit = textValues[task.id]?.trim();

          const handleTextComplete = async () => {
            if (readOnly || updating || task.completed || !canSubmit) return;
            setUpdating(task.id);
            try {
              await updateTask(task.id, { completed: true, pm_text_response: textValues[task.id].trim() });
              onTaskUpdate();
            } catch (err) {
              console.error('Error updating task:', err);
            } finally {
              setUpdating(null);
            }
          };

          return (
            <div
              key={task.id}
              className={`${styles.pmActionItem} ${styles.pmTextTask} ${task.completed ? styles.pmActionItemCompleted : ''}`}
            >
              <div
                className={`${styles.pmCheckbox} ${task.completed ? styles.pmCheckboxChecked : ''}`}
                onClick={handleTextComplete}
                style={{ cursor: canSubmit && !task.completed ? 'pointer' : 'default' }}
              >
                {task.completed && <SmallCheckIcon />}
              </div>
              <div className={styles.pmTextTaskContent}>
                <span className={styles.pmActionLabel}>{displayLabel}</span>
                {!task.completed ? (
                  <div className={styles.pmTextInputWrapper}>
                    <input
                      type="text"
                      className={styles.pmTextInlineInput}
                      placeholder={isBannerTask ? 'Yes / No / Lobby only...' : 'Enter response'}
                      value={textValues[task.id] || ''}
                      onChange={(e) => setTextValues({ ...textValues, [task.id]: e.target.value })}
                      disabled={readOnly}
                    />
                    {isBannerTask && (
                      <WhatsThisLink
                        text='Raptor Vending uses retractable banners (33" x 81") to announce the upcoming food program to employees before machines arrive. This builds awareness and excitement. Please confirm if banner placement is allowed on-site (e.g. "Yes" or "No - lobby only").'
                        imageUrl="/banner-example.jpg"
                      />
                    )}
                  </div>
                ) : (
                  <div className={styles.pmTextValue}>{task.pm_text_response}</div>
                )}
              </div>
            </div>
          );
        })}

        {(surveyClicks > 0 || surveyCompletions > 0) && (
          <div className={styles.surveyStats}>
            <span>
              <strong>{surveyClicks || 0}</strong> clicks
            </span>
            <span>
              <strong>{surveyCompletions || 0}</strong> completed
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
