import { buildCsrfHeaders } from '../cognitoAuth.js';

/** 
 * Construye headers de autenticación siguiendo el patrón del proyecto (Bearer + XSRF).
 */
export function authHeaders(token) {
    const headers = buildCsrfHeaders({ 'Content-Type': 'application/json' });
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    return headers;
}
