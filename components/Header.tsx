'use client';

import { Logo } from './Logo';
import styles from './Header.module.css';

interface ProjectInfo {
  id: string;
  propertyName: string;
  address: string;
  locationName?: string | null;
  locationFloor?: string | null;
  employeeCount?: number | string;
  configuration?: unknown;
}

interface HeaderProps {
  project: ProjectInfo;
  showLogo?: boolean;
}

/**
 * Header component for project pages
 * Displays project info with optional logo
 */
export function Header({ project, showLogo = true }: HeaderProps) {
  return (
    <header className={styles.header}>
      {showLogo ? (
        <div className={styles.headerTop}>
          <Logo variant="light" height={100} />
          <div className={styles.projectId}>Project #{project.id}</div>
        </div>
      ) : (
        <div className={styles.headerTopCompact}>
          <h1 className={styles.locationName}>{project.propertyName}</h1>
          <span className={styles.projectId}>Project #{project.id}</span>
        </div>
      )}

      {showLogo && <h1 className={styles.locationName}>{project.propertyName}</h1>}
      <p className={styles.locationAddress}>{project.address}</p>
      {project.locationName && (
        <p className={`${styles.locationAddress} ${styles.locationDetail}`}>
          Location: {project.locationName}
          {project.locationFloor && ` (Floor ${project.locationFloor})`}
        </p>
      )}

      <div className={styles.headerMeta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Building Size</span>
          <span className={styles.metaValue}>{project.employeeCount} Employees</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Configuration</span>
          <span className={styles.metaValue}>{String(project.configuration ?? '')}</span>
        </div>
      </div>
    </header>
  );
}

export default Header;
