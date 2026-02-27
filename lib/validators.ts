/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate email format
 */
export function isValidEmail(email: unknown): email is string {
  if (!isNonEmptyString(email)) {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate and normalize phone number
 * Returns normalized phone number or null if invalid
 */
export function validatePhone(phone: unknown): string | null {
  if (!isNonEmptyString(phone)) {
    return null;
  }

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Check for valid US phone number (10 or 11 digits starting with 1)
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return null;
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Validate URL format
 */
export function isValidUrl(url: unknown): url is string {
  if (!isNonEmptyString(url)) {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate required fields are present
 */
export function validateRequired<T extends Record<string, unknown>>(
  data: T,
  requiredFields: (keyof T)[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      missing.push(String(field));
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Check if value is a valid UUID or short ID
 */
export function isValidId(id: unknown): id is string {
  if (!isNonEmptyString(id)) {
    return false;
  }
  // UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Short ID format (alphanumeric, 8-32 chars)
  const shortIdRegex = /^[a-z0-9]{8,32}$/i;

  return uuidRegex.test(id) || shortIdRegex.test(id);
}

/**
 * Sanitize a value for logging (remove sensitive data)
 */
export function sanitizeForLog(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'access_token',
    'api_key',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeForLog(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Validate that a value is one of the allowed values
 */
export function isOneOf<T>(value: unknown, allowedValues: readonly T[]): value is T {
  return allowedValues.includes(value as T);
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
