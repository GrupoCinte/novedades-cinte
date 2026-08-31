import ROLE_PRIORITY from '../constants/rolePriority.json';

const ATRACCION_PANELS = new Set(['atraccion']);

/** Debe coincidir con `POLICY` en `src/rbac.js`. */
const POLICY_PANELS_BY_ROLE = {
    super_admin: ['dashboard', 'calendar', 'gestion', 'admin', 'contratacion', 'onboarding', 'comercial', 'directorio', 'atraccion'],
    cac: ['dashboard', 'calendar', 'gestion', 'admin', 'onboarding', 'directorio'],
    admin_ch: ['dashboard', 'calendar', 'gestion', 'contratacion', 'onboarding', 'atraccion'],
    team_ch: ['dashboard', 'calendar', 'gestion', 'contratacion', 'onboarding', 'atraccion'],
    comercial: ['comercial'],
    gp: ['gestion', 'onboarding'],
    nomina: ['dashboard', 'calendar', 'gestion', 'onboarding', 'conciliaciones'],
    analista_conciliaciones: ['conciliaciones'],
    atraccion_talento: ['atraccion', 'reubicaciones'],
    consultor: []
};

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

export function resolveRoleFromTokenPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const fromDirect = String(payload.role || payload['custom:role'] || '').trim().toLowerCase();
    if (fromDirect && ROLE_PRIORITY.includes(fromDirect)) return fromDirect;
    const groupsClaim = payload['cognito:groups'];
    let groups = [];
    if (Array.isArray(groupsClaim)) {
        groups = groupsClaim;
    } else if (groupsClaim) {
        groups = [groupsClaim];
    }
    const normalized = new Set(groups.map((g) => String(g || '').toLowerCase()));
    return ROLE_PRIORITY.find((role) => normalized.has(role)) || '';
}

export function getPanelsFromToken(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const panels = Array.isArray(payload?.panels) ? payload.panels.map(String) : [];
    if (panels.length) return panels;
    const role = resolveRoleFromTokenPayload(payload);
    const fallback = POLICY_PANELS_BY_ROLE[role];
    return fallback ? [...fallback] : [];
}

/** Acceso al módulo Atracción de Talento (`/admin/atraccion-talento`). */
export function userHasAtraccionTalentoAccess(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    if (role === 'super_admin') return true;
    const panels = getPanelsFromToken(authOrToken);
    return panels.some((p) => ATRACCION_PANELS.has(p));
}
