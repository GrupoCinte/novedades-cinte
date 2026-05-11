/**
 * Catálogo roles TI: lectura alineada al cotizador; escritura solo roles de staff.
 */

import { getPanelsFromToken } from './comercialAccess.js';

const WRITE_ROLES = new Set(['super_admin', 'cac', 'admin_ch']);

function normalizePayload(authOrToken) {
    if (authOrToken && typeof authOrToken === 'object') {
        const raw = authOrToken;
        if (raw.user && typeof raw.user === 'object') {
            return { role: raw.user.role, panels: raw.user.panels };
        }
        if (raw.claims && typeof raw.claims === 'object') return raw.claims;
        return raw;
    }
    return null;
}

/** Quien puede abrir la pantalla (mismo universo que cotizador + admin hub). */
export function userHasRolesTiCatalogRead(authOrToken) {
    const panels = getPanelsFromToken(authOrToken);
    return panels.some((p) => ['comercial', 'dashboard', 'gestion', 'admin'].includes(p));
}

export function userHasRolesTiCatalogWrite(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = String(payload?.role || '').trim().toLowerCase();
    return WRITE_ROLES.has(role);
}
