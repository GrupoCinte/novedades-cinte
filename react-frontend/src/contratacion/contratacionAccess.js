import ROLE_PRIORITY from '../constants/rolePriority.json';

/**
 * Alineado con src/rbac.js POLICY: quién puede ver el módulo Contratación IA.
 */
const ROLES_WITH_CONTRATACION_PANEL = new Set(['super_admin', 'cac', 'admin_ch', 'team_ch', 'nomina', 'gp']);

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

/**
 * Resuelve rol efectivo desde el payload del JWT (app o Cognito).
 */
export function resolveRoleFromTokenPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const fromDirect = String(payload.role || payload['custom:role'] || '').trim().toLowerCase();
    if (fromDirect && ROLE_PRIORITY.includes(fromDirect)) return fromDirect;

    const groupsClaim = payload['cognito:groups'];
    const groups = Array.isArray(groupsClaim) ? groupsClaim : groupsClaim ? [groupsClaim] : [];
    const normalized = groups.map((g) => String(g || '').toLowerCase());
    const fromGroups = ROLE_PRIORITY.find((role) => normalized.includes(role));
    return fromGroups || '';
}

/**
 * true si el usuario debe ver el módulo (mismo criterio que allowPanel('contratacion') en backend).
 */
export function userHasContratacionPanel(token) {
    const payload = decodeJwtPayload(token);
    if (!payload) return false;

    const panels = Array.isArray(payload.panels) ? payload.panels.map((p) => String(p)) : [];
    if (panels.includes('contratacion')) return true;

    const role = resolveRoleFromTokenPayload(payload);
    return ROLES_WITH_CONTRATACION_PANEL.has(role);
}

export function getContratacionPermissions(token) {
    const payload = decodeJwtPayload(token);
    const role = resolveRoleFromTokenPayload(payload);
    const panels = Array.isArray(payload?.panels) ? payload.panels.map((p) => String(p)) : [];
    const hasPanel = panels.includes('contratacion') || ROLES_WITH_CONTRATACION_PANEL.has(role);
    const canEliminarCandidato = role === 'super_admin' || role === 'admin_ch';
    return { canEliminarCandidato, hasPanel, role };
}
