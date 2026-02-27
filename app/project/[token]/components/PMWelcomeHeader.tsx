'use client';

import type { ProjectData } from './ProjectContent';
import styles from '../project.module.css';

interface PMWelcomeHeaderProps {
  project: ProjectData;
}

export function PMWelcomeHeader({ project }: PMWelcomeHeaderProps) {
  // Count all PM tasks across all phases
  const allPmTasks = project.phases.flatMap((phase) =>
    (phase.tasks || []).filter((t) => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'))
  );

  const totalPmTasks = allPmTasks.length;
  const completedPmTasks = allPmTasks.filter((t) => t.completed).length;
  const remainingPmTasks = totalPmTasks - completedPmTasks;

  // Get first name from property manager
  const fullName = project.propertyManager?.name || 'Property Manager';
  const firstName = fullName.split(' ')[0];

  // If all tasks done, show completion message
  if (remainingPmTasks === 0 && totalPmTasks > 0) {
    return (
      <div className={`${styles.pmWelcomeHeader} ${styles.pmWelcomeHeaderCompleted}`}>
        <div className={styles.pmWelcomeInner}>
          <span className={styles.pmWelcomeCheck}>✓</span>
          <div className={styles.pmWelcomeText}>
            <p>
              <strong>You&apos;re all set, {firstName}!</strong> You&apos;ve completed all your tasks. We&apos;ll take
              it from here—a great new amenity is on its way to your tenants.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pmWelcomeHeader}>
      <div className={styles.pmWelcomeInner}>
        <div className={styles.pmWelcomeText}>
          <p>
            <strong>Welcome, {firstName}!</strong> We&apos;re excited to bring Raptor infrastructure to your building.
            Your part is simple: just {remainingPmTasks} of {totalPmTasks} items, marked below. Check them off as you
            go—we&apos;ll take care of everything else. A great new amenity is on its way to your tenants.
          </p>
        </div>
        <div className={styles.pmTaskCounter}>
          <div className={styles.pmTaskCircle}>
            <span className={styles.pmTaskRemaining}>{remainingPmTasks}</span>
            <span className={styles.pmTaskTotal}>of {totalPmTasks}</span>
          </div>
          <span className={styles.pmTaskLabel}>
            items
            <br />
            remaining
          </span>
        </div>
      </div>
    </div>
  );
}
