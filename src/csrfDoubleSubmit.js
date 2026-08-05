'use strict';

/**
 * CSRF doble envío (cookie legible + header) para mutaciones /api.
 * Skip acotado: login, Bearer, email-acción, atracción internal, e intakes
 * machine-to-machine con `x-onboarding-key` (auth real en el handler).
 */

const CSRF_SKIP_PATHS = new Set([
    '/api/login',
    '/api/auth/complete-new-password',
    '/api/auth/forgot-password',
    '/api/auth/reset-password'
]);

const ONBOARDING_INTAKE_PATHS = new Set([
    '/api/onboarding/intake',
    '/api/onboarding/ficha-novedades/intake'
]);

/**
 * @param {{ method?: string, path?: string, get?: (name: string) => string }} req
 * @returns {boolean} true = no exigir cookie/header CSRF
 */
function shouldSkipCsrfDoubleSubmit(req) {
    const method = String(req.method || '').toUpperCase();
    if (method === 'OPTIONS') return true;
    const p = req.path || '';
    if (!p.startsWith('/api')) return true;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
    const get = typeof req.get === 'function' ? (name) => req.get(name) : () => '';
    if (String(get('authorization') || '').startsWith('Bearer ')) return true;
    if (CSRF_SKIP_PATHS.has(p)) return true;
    if (p.startsWith('/api/conciliaciones/email-accion/')) return true;
    if (p.startsWith('/api/atraccion/internal/')) return true;
    // Lambda/n8n → portal: auth por x-onboarding-key en el handler (checkIntakeAuth).
    if (ONBOARDING_INTAKE_PATHS.has(p) && String(get('x-onboarding-key') || '').trim()) {
        return true;
    }
    return false;
}

module.exports = {
    CSRF_SKIP_PATHS,
    ONBOARDING_INTAKE_PATHS,
    shouldSkipCsrfDoubleSubmit
};
