'use client';

import styles from './Spinner.module.css';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

/**
 * Spinner - Loading indicator
 */
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClass = styles[size];
  return <div className={`${styles.spinner} ${sizeClass} ${className}`} />;
}

interface LoadingProps {
  label?: string;
  size?: SpinnerSize;
  fullPage?: boolean;
}

/**
 * Loading - Spinner with optional label, centered in container
 */
export function Loading({ label, size = 'lg', fullPage = false }: LoadingProps) {
  return (
    <div className={`${styles.container} ${fullPage ? styles.fullPage : ''}`}>
      <Spinner size={size} />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export default Spinner;
