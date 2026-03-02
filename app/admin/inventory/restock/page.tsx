'use client';

import { AdminShell } from '../../components/AdminShell';
import styles from '../inventory.module.css';

export default function RestockPage() {
  return (
    <AdminShell title="Restock Machine">
      <div className={styles.inventoryPage}>
        <div className={styles.testPage}>
          <div className={styles.testCard}>
            <div className={styles.testHeader}>
              <h2 className={styles.testTitle}>Restock Machine</h2>
              <p className={styles.testSubtitle}>Coming soon in Phase 2</p>
            </div>
            <div className={styles.testBody}>
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <p>This feature will allow you to:</p>
                <ul style={{ textAlign: 'left', margin: '16px auto', maxWidth: '280px' }}>
                  <li>Select a machine location</li>
                  <li>Scan items being loaded</li>
                  <li>Track what goes into each machine</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
