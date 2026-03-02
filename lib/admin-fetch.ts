/**
 * Admin Fetch Utility
 *
 * Use this for ALL admin API calls to ensure consistent auth handling.
 * - Automatically includes Authorization header from sessionStorage
 * - Throws ApiError with detailed info (endpoint, status, message)
 * - Does NOT redirect - caller handles errors
 */

export class ApiError extends Error {
  endpoint: string;
  status: number;

  constructor(message: string, endpoint: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

export class AuthError extends ApiError {
  constructor(message: string, endpoint: string = 'unknown', status: number = 0) {
    super(message, endpoint, status);
    this.name = 'AuthError';
  }
}

/**
 * Get the admin token from sessionStorage
 * Throws if no token is found
 */
export function getAdminToken(): string {
  if (typeof window === 'undefined') {
    throw new AuthError('Cannot access auth token on server', 'server', 0);
  }

  const token = sessionStorage.getItem('adminToken');

  if (!token) {
    console.error('[Auth] No admin token in sessionStorage');
    throw new AuthError('No admin token in sessionStorage - not logged in', 'sessionStorage', 0);
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
 * @throws AuthError if no token, ApiError on non-2xx responses
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string;

  try {
    token = getAdminToken();
  } catch (e) {
    // Re-throw with endpoint info - DO NOT REDIRECT
    throw new AuthError(
      `No token available when calling ${url}`,
      url,
      0
    );
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
  console.log(`[AdminFetch] Token present: ${token ? 'YES (' + token.substring(0, 20) + '...)' : 'NO'}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log(`[AdminFetch] Response: ${response.status} ${response.statusText}`);

  // Handle 401 - token expired or invalid - DO NOT REDIRECT
  if (response.status === 401) {
    console.error('[AdminFetch] 401 Unauthorized - token expired or invalid');
    throw new AuthError(
      `401 Unauthorized - token expired or invalid`,
      url,
      401
    );
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
export async function adminFetchJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
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
