'use client';

import { AdminShell } from '../../components/AdminShell';
import styles from '../inventory.module.css';

export default function AdjustPage() {
  return (
    <AdminShell title="Adjust Inventory">
      <div className={styles.inventoryPage}>
        <div className={styles.testPage}>
          <div className={styles.testCard}>
            <div className={styles.testHeader}>
              <h2 className={styles.testTitle}>Adjust Inventory</h2>
              <p className={styles.testSubtitle}>Coming soon in Phase 2</p>
            </div>
            <div className={styles.testBody}>
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 20V10" />
                    <path d="M18 20V4" />
                    <path d="M6 20v-4" />
                  </svg>
                </div>
                <p>This feature will allow you to:</p>
                <ul style={{ textAlign: 'left', margin: '16px auto', maxWidth: '280px' }}>
                  <li>Make inventory corrections</li>
                  <li>Record shrinkage/waste</li>
                  <li>Adjust counts after audits</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
