/**
 * Format a date string to YYYY-MM-DD format
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format a date for display (e.g., "January 15, 2024")
 */
export function formatDisplayDate(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a date as short display (e.g., "Jan 15")
 */
export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculate the number of days remaining until a target date
 * Returns negative number if date is in the past
 */
export function calculateDaysRemaining(targetDate: Date | string | null | undefined): number | null {
  if (!targetDate) return null;

  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  if (isNaN(target.getTime())) return null;

  const now = new Date();
  // Reset time to start of day for accurate day calculation
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if a date is in the past
 */
export function isPastDate(date: Date | string | null | undefined): boolean {
  const days = calculateDaysRemaining(date);
  return days !== null && days < 0;
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string | null | undefined): boolean {
  const days = calculateDaysRemaining(date);
  return days === 0;
}

/**
 * Get a relative time string (e.g., "2 days ago", "in 3 days")
 */
export function getRelativeTimeString(date: Date | string | null | undefined): string {
  const days = calculateDaysRemaining(date);
  if (days === null) return '';

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/**
 * Format a datetime string with time (e.g., "January 15, 2024 at 3:30 PM")
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Parse a date string safely, returning null for invalid dates
 */
export function parseDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Get the start of today (midnight)
 */
export function getStartOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Get the end of today (11:59:59.999 PM)
 */
export function getEndOfToday(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
