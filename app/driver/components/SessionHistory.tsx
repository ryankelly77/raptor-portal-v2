'use client';

import Image from 'next/image';
import styles from '../driver.module.css';

interface TempLogEntry {
  id: string;
  entry_type: 'pickup' | 'delivery';
  temperature: number;
  location_name: string | null;
  timestamp: string;
}

interface TempLogSession {
  id: string;
  vehicle_type: string;
  status: 'active' | 'completed';
  created_at: string;
  completed_at: string | null;
  entries: TempLogEntry[];
}

interface SessionHistoryProps {
  session: TempLogSession;
  driverName: string;
  onStartNew: () => void;
  onBack: () => void;
}

export function SessionHistory({ session, driverName, onStartNew, onBack }: SessionHistoryProps) {
  const entries = session.entries || [];
  const stops = entries.length;

  // Calculate duration
  let duration: string | null = null;
  if (entries.length > 1) {
    const times = entries.map((e) => new Date(e.timestamp).getTime());
    const firstTime = Math.min(...times);
    const lastTime = Math.max(...times);
    const diffMs = lastTime - firstTime;
    const diffMins = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  return (
    <div className={styles.driverCompleted}>
      <div className={styles.driverBranding}>
        <Image src="/logo-dark.png" alt="Raptor Vending" width={160} height={64} />
        <h1>Session complete, {driverName.split(' ')[0] || 'Driver'}!</h1>
      </div>

      <div className={styles.completedSummary}>
        <div className={styles.completedStat}>
          <span className={styles.statValue}>{stops}</span>
          <span className={styles.statLabel}>Stops Logged</span>
        </div>
        {duration && (
          <div className={styles.completedStat}>
            <span className={styles.statValue}>{duration}</span>
            <span className={styles.statLabel}>Total Time</span>
          </div>
        )}
      </div>

      <p className={styles.completedMessage}>
        Great job! Your temperature log has been saved.
      </p>

      <button
        onClick={onStartNew}
        className={`${styles.driverBtn} ${styles.driverBtnPrimary} ${styles.driverBtnLarge}`}
      >
        Start New Session
      </button>

      <button
        onClick={onBack}
        className={`${styles.driverBtn} ${styles.driverBtnSecondary}`}
        style={{ marginTop: '12px' }}
      >
        Back to Home
      </button>
    </div>
  );
}
