'use client';

import styles from './OverallProgress.module.css';

interface OverallProgressProps {
  progress: number | null;
  estimatedCompletion: string;
  daysRemaining?: number | null;
}

/**
 * OverallProgress - Displays a progress bar with completion percentage
 * Used on project pages to show installation progress
 */
export function OverallProgress({
  progress,
  estimatedCompletion,
  daysRemaining,
}: OverallProgressProps) {
  const progressValue = progress ?? 0;
  const days = daysRemaining ?? undefined;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Overall Installation Progress</span>
        <span className={styles.percent}>{progressValue}%</span>
      </div>
      <div className={styles.barContainer}>
        <div className={styles.barFill} style={{ width: `${progressValue}%` }} />
      </div>
      <div className={styles.estimated}>
        Estimated completion: <strong>{estimatedCompletion}</strong>
        {days !== undefined && days > 0 && ` (${days} days remaining)`}
      </div>
    </div>
  );
}

export default OverallProgress;
