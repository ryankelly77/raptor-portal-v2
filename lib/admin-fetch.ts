/**
 * Admin Fetch Utility
 *
 * Use this for ALL admin API calls to ensure consistent auth handling.
 * - Automatically includes Authorization header from sessionStorage
 * - Throws immediately if no token (prevents silent auth failures)
 * - Handles 401 responses by clearing session and redirecting to login
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Get the admin token from sessionStorage
 * Throws if no token is found
 */
export function getAdminToken(): string {
  if (typeof window === 'undefined') {
    throw new AuthError('Cannot access auth token on server');
  }

  const token = sessionStorage.getItem('adminToken');

  if (!token) {
    console.error('[Auth] No admin token in sessionStorage');
    throw new AuthError('Not logged in');
  }

  return token;
}

/**
 * Clear admin session and redirect to login
 */
export function clearSessionAndRedirect(): void {
  if (typeof window === 'undefined') return;

  console.warn('[Auth] Clearing session and redirecting to login');
  sessionStorage.removeItem('adminAuth');
  sessionStorage.removeItem('adminToken');
  window.location.href = '/admin/login';
}

/**
 * Make an authenticated admin API request
 *
 * @param url - The API endpoint URL
 * @param options - Fetch options (method, body, etc.)
 * @returns The fetch Response
 * @throws AuthError if no token or if 401 response
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string;

  try {
    token = getAdminToken();
  } catch (e) {
    clearSessionAndRedirect();
    throw e;
  }

  // Build headers - handle both JSON and FormData
  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`,
  };

  // Only set Content-Type for non-FormData requests
  // FormData needs the browser to set the boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Merge with any existing headers
  const existingHeaders = options.headers as Record<string, string> | undefined;
  if (existingHeaders) {
    Object.assign(headers, existingHeaders);
  }

  console.log(`[AdminFetch] ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 - token expired or invalid
  if (response.status === 401) {
    console.error('[AdminFetch] 401 Unauthorized - token expired or invalid');
    clearSessionAndRedirect();
    throw new AuthError('Session expired');
  }

  return response;
}

/**
 * Make an authenticated admin API request and parse JSON response
 *
 * @param url - The API endpoint URL
 * @param options - Fetch options
 * @returns The parsed JSON response
 */
export async function adminFetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await adminFetch(url, options);
  return response.json();
}

/**
 * Get headers for admin API requests (for components that need raw headers)
 * Throws if no token is found
 */
export function getAuthHeaders(): HeadersInit {
  const token = getAdminToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}
