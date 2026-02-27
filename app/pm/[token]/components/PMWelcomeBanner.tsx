'use client';

import type { ProjectView } from '@/lib/data/projects';
import styles from '../pm-portal.module.css';

interface PMWelcomeBannerProps {
  project: ProjectView;
  pmName: string;
}

export function PMWelcomeBanner({ project, pmName }: PMWelcomeBannerProps) {
  // Count all PM tasks across all phases
  const allPmTasks = project.phases.flatMap((phase) =>
    (phase.tasks || []).filter((t) => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'))
  );

  const totalPmTasks = allPmTasks.length;
  const completedPmTasks = allPmTasks.filter((t) => t.completed).length;
  const remainingPmTasks = totalPmTasks - completedPmTasks;

  // Get first name from property manager name
  const firstName = pmName.split(' ')[0];

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

  // If no PM tasks at all, don't show the banner
  if (totalPmTasks === 0) {
    return null;
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
