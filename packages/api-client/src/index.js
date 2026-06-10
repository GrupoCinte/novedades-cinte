import { buildCsrfHeaders } from '@cinte/shared/cognitoAuth.js';

/**
 * fetch autenticado con cookie HttpOnly + CSRF (mismo contrato que el SPA legacy).
 */
export async function apiFetch(path, options = {}) {
  const headers = buildCsrfHeaders({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  });
  return fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });
}
