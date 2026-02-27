'use client';

import { useState } from 'react';
import type { ProjectView } from '@/lib/data/projects';
import styles from '../pm-portal.module.css';

interface PMMobileBottomBarProps {
  project: ProjectView | undefined;
  projects: ProjectView[];
  selectedToken: string;
  onSelectProject: (token: string) => void;
}

// Check icon for completed state
const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    width="16"
    height="16"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function PMMobileBottomBar({ project, projects = [], selectedToken, onSelectProject }: PMMobileBottomBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMultipleProjects = projects.length > 1;

  // Calculate remaining PM tasks for a project
  const getPmTasksRemaining = (proj: ProjectView) => {
    const allPmTasks =
      proj.phases?.flatMap((phase) =>
        (phase.tasks || []).filter((t) => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'))
      ) || [];
    return allPmTasks.filter((t) => !t.completed).length;
  };

  const remainingTasks = project ? getPmTasksRemaining(project) : 0;
  const propertyName = project?.propertyName || 'Property';

  const handleSelect = (token: string) => {
    onSelectProject(token);
    setMenuOpen(false);
  };

  if (!project) return null;

  return (
    <div className={styles.pmMobileBar}>
      {/* Items Remaining */}
      <div className={styles.pmMobileTasks}>
        {remainingTasks === 0 ? (
          <>
            <div className={`${styles.pmMobileTasksCount} ${styles.pmMobileTasksCountComplete}`}>
              <CheckIcon />
            </div>
            <span className={styles.pmMobileTasksLabel}>All done!</span>
          </>
        ) : (
          <>
            <span className={styles.pmMobileTasksPrefix}>Only</span>
            <div className={styles.pmMobileTasksCount}>{remainingTasks}</div>
            <span className={styles.pmMobileTasksLabel}>to-do{remainingTasks !== 1 ? 's' : ''}!</span>
          </>
        )}
      </div>

      {/* Property Name / Selector */}
      <button
        className={`${styles.pmMobileProperty} ${hasMultipleProjects ? styles.pmMobilePropertyHasMenu : ''}`}
        onClick={() => hasMultipleProjects && setMenuOpen(!menuOpen)}
      >
        <span className={styles.pmMobilePropertyName}>{propertyName}</span>
        {hasMultipleProjects && (
          <svg
            className={`${styles.pmMobileCaret} ${menuOpen ? styles.pmMobileCaretOpen : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="18"
            height="18"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {/* Property Menu */}
      {menuOpen && hasMultipleProjects && (
        <div className={styles.pmMobileMenu}>
          {projects.map((proj) => (
            <button
              key={proj.publicToken}
              className={`${styles.pmMobileMenuItem} ${selectedToken === proj.publicToken ? styles.pmMobileMenuItemActive : ''}`}
              onClick={() => handleSelect(proj.publicToken)}
            >
              <span className={styles.pmMobileMenuName}>{proj.propertyName}</span>
              <span className={styles.pmMobileMenuTasks}>{getPmTasksRemaining(proj)} items</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
