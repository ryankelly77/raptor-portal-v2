'use client';

import styles from '../project.module.css';

export function PoweredBy() {
  return (
    <div className={styles.poweredBy}>
      <span>Powered by</span>
      <a href="https://raptor-vending.com" target="_blank" rel="noopener noreferrer">
        Raptor Vending
      </a>
      <span className={styles.poweredByTagline}>Food Infrastructure for Modern Workplaces</span>
    </div>
  );
}
