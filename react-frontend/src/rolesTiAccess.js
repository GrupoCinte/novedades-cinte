/**
 * Catálogo roles TI: lectura alineada al cotizador; escritura solo roles de staff.
 */

import { getPanelsFromToken } from './comercialAccess.js';
import { resolveRoleFromTokenPayload } from './contratacion/contratacionAccess.js';

/** Escritura catálogo TI: mismo universo que cotizador (`comercial`); sin rol CH sin panel comercial. */
const WRITE_ROLES = new Set(['super_admin']);

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

/** Quien puede abrir la pantalla (alineado al cotizador: panel `comercial` en JWT). GP/CAC excluidos. */
export function userHasRolesTiCatalogRead(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    if (role === 'gp') return false;
    if (role === 'super_admin') return true;
    const panels = getPanelsFromToken(authOrToken);
    return panels.includes('comercial');
}

export function userHasRolesTiCatalogWrite(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = String(payload?.role || '').trim().toLowerCase();
    return WRITE_ROLES.has(role);
}
