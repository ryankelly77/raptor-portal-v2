'use client';

import { useState } from 'react';
import type { ProjectView } from '@/lib/data/projects';
import styles from '../pm-portal.module.css';

interface PMMobileHeaderProps {
  project: ProjectView;
}

export function PMMobileHeader({ project }: PMMobileHeaderProps) {
  const [showMessage, setShowMessage] = useState(false);

  // Count all PM tasks across all phases
  const allPmTasks =
    project.phases?.flatMap((phase) =>
      (phase.tasks || []).filter((t) => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'))
    ) || [];

  const totalPmTasks = allPmTasks.length;
  const completedPmTasks = allPmTasks.filter((t) => t.completed).length;
  const remainingPmTasks = totalPmTasks - completedPmTasks;

  // Get first name from property manager
  const fullName = project.propertyManager?.name || 'Property Manager';
  const firstName = fullName.split(' ')[0];

  const allDone = remainingPmTasks === 0 && totalPmTasks > 0;

  return (
    <>
      <div className={styles.pmMobileHeader}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="Raptor Vending" className={styles.pmMobileLogo} />
        <div className={styles.pmMobileProgress}>
          <div className={styles.pmMobileProgressBar}>
            <div
              className={styles.pmMobileProgressFill}
              style={{ width: `${project.overallProgress || 0}%` }}
            />
          </div>
          <span className={styles.pmMobileProgressText}>{project.overallProgress || 0}%</span>
        </div>
        <button className={styles.pmMobileGreeting} onClick={() => setShowMessage(!showMessage)}>
          Hi, {firstName}
          <svg
            className={`${styles.pmMobileGreetingIcon} ${showMessage ? styles.pmMobileGreetingIconOpen : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {showMessage && (
        <div className={styles.pmMobileMessage} onClick={() => setShowMessage(false)}>
          {allDone ? (
            <p>
              <strong>You&apos;re all set!</strong> You&apos;ve completed all your tasks. We&apos;ll take it from
              here—a great new amenity is on its way to your tenants.
            </p>
          ) : (
            <p>
              <strong>Welcome!</strong> We&apos;re excited to bring Raptor infrastructure to your building. Your part
              is simple: just {remainingPmTasks} of {totalPmTasks} items, marked below. Check them off as you go—
              we&apos;ll take care of everything else.
            </p>
          )}
        </div>
      )}
    </>
  );
}
