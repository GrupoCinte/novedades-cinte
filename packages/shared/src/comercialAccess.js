/**
 * Acceso al módulo Comercial (cotizador), alineado con POLICY en src/rbac.js.
 * El panel `comercial` es exclusivo del rol comercial; otros roles usan dashboard/gestión/admin.
 */

const NOVEDADES_PANELS = new Set(['dashboard', 'calendar', 'gestion', 'admin']);

/** Solo el panel JWT `comercial` habilita el módulo cotizador (evita acceso vía dashboard/gestión sin comercial). */
const COTIZADOR_PANELS = new Set(['comercial']);

/** Debe coincidir con `POLICY` en `src/rbac.js` (fallback si el JWT no trae `panels`). */
const POLICY_PANELS_BY_ROLE = {
    super_admin: ['dashboard', 'calendar', 'gestion', 'admin', 'contratacion', 'comercial', 'directorio'],
    /** Paridad backend `POLICY`: submódulos novedades (dashboard/calendario/gestión) + admin + directorio; sin comercial ni contratación. */
    cac: ['dashboard', 'calendar', 'gestion', 'admin', 'directorio'],
    admin_ch: ['dashboard', 'calendar', 'gestion', 'contratacion'],
    team_ch: ['dashboard', 'calendar', 'gestion', 'contratacion'],
    comercial: ['comercial'],
    gp: ['gestion'],
    nomina: ['dashboard', 'calendar', 'gestion'],
    /** Entra consultor: sin paneles admin (docs/RBAC_MATRIX.md). */
    consultor: []
};

function normalizePayload(authOrToken) {
    if (authOrToken && typeof authOrToken === 'object') {
        const raw = authOrToken;
        if (raw.user && typeof raw.user === 'object') {
            return {
                role: raw.user.role,
                panels: raw.user.panels,
                email: raw.user.email,
                username: raw.user.username
            };
        }
        if (raw.claims && typeof raw.claims === 'object') return raw.claims;
        return raw;
    }
    const token = String(authOrToken || '');
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

/**
 * Paneles efectivos del usuario: claim `panels` del JWT o, si viene vacío, los del rol (mismo criterio que el backend).
 */
export function getPanelsFromToken(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const panels = Array.isArray(payload?.panels) ? payload.panels.map((p) => String(p)) : [];
    if (panels.length) return panels;
    const role = String(payload?.role || '').trim().toLowerCase();
    const fallback = POLICY_PANELS_BY_ROLE[role];
    return fallback ? [...fallback] : [];
}

/** Puede usar el área admin de novedades (Dashboard / calendario / gestión). */
export function userHasNovedadesAdminAccess(authOrToken) {
    const panels = getPanelsFromToken(authOrToken);
    return panels.some((p) => NOVEDADES_PANELS.has(p));
}

/** Puede usar el cotizador (`/admin/comercial`): solo roles con panel `comercial` o super_admin. */
export function userHasCotizadorAccess(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = String(payload?.role || '').trim().toLowerCase();
    if (role === 'nomina' || role === 'gp' || role === 'cac') return false;
    if (role === 'super_admin') return true;
    const panels = getPanelsFromToken(authOrToken);
    return panels.some((p) => COTIZADOR_PANELS.has(p));
}
