/**
 * Acceso al módulo Comercial (cotizador), alineado con POLICY en src/rbac.js.
 * El panel `comercial` es exclusivo del rol comercial; otros roles usan dashboard/gestión/admin.
 */

const NOVEDADES_PANELS = new Set(['dashboard', 'calendar', 'gestion', 'admin']);

const COTIZADOR_PANELS = new Set(['comercial', 'dashboard', 'gestion', 'admin']);

function decodeJwtPayload(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

export function getPanelsFromToken(token) {
    const payload = decodeJwtPayload(token);
    const panels = Array.isArray(payload?.panels) ? payload.panels.map((p) => String(p)) : [];
    return panels;
}

/** Puede usar el área admin de novedades (Dashboard / calendario / gestión). */
export function userHasNovedadesAdminAccess(token) {
    const panels = getPanelsFromToken(token);
    return panels.some((p) => NOVEDADES_PANELS.has(p));
}

/** Puede usar el cotizador (API /admin/comercial). */
export function userHasCotizadorAccess(token) {
    const panels = getPanelsFromToken(token);
    return panels.some((p) => COTIZADOR_PANELS.has(p));
}
