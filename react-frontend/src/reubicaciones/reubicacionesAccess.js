// react-frontend/src/reubicaciones/reubicacionesAccess.js

import ROLE_PRIORITY from '../constants/rolePriority.json';

/**
 * Alineado con src/rbac.js REUBICACIONES_CONFIG
 */
const ROLES_WITH_REUBICACIONES_PANEL = new Set([
    'super_admin',
    'gp',
    'admin_ch',
    'team_ch',
    'atraccion_talento',
    'cac'
]);

const ROLES_CAN_DECIDE_APTITUD = new Set(['super_admin', 'gp']);
const ROLES_CAN_REGISTER_OBSERVACION = new Set(['super_admin', 'admin_ch', 'team_ch']);
const ROLES_CAN_MODIFY = new Set(['super_admin', 'cac']);

function normalizePayload(authOrToken) {
    if (authOrToken && typeof authOrToken === 'object') {
        const raw = authOrToken;
        if (raw.user && typeof raw.user === 'object') {
            return {
                role: raw.user.role,
                panels: raw.user.panels
            };
        }
        if (raw.claims && typeof raw.claims === 'object') return raw.claims;
        return raw;
    }
    const token = String(authOrToken || '');
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

function resolveRoleFromTokenPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const fromDirect = String(payload.role || payload['custom:role'] || '').trim().toLowerCase();
    if (fromDirect && ROLE_PRIORITY.includes(fromDirect)) return fromDirect;

    const groupsClaim = payload['cognito:groups'];
    const groups = Array.isArray(groupsClaim)
        ? groupsClaim
        : groupsClaim
            ? [groupsClaim]
            : [];
    const normalized = groups.map((g) => String(g || '').toLowerCase());
    const fromGroups = ROLE_PRIORITY.find((role) => normalized.includes(role));
    return fromGroups || '';
}

export function userHasReubicacionesPanel(authOrToken) {
    const payload = normalizePayload(authOrToken);
    if (!payload) return false;

    const role = resolveRoleFromTokenPayload(payload);
    const panels = Array.isArray(payload.panels) ? payload.panels.map(String) : [];

    if (panels.includes('reubicaciones')) return true;
    return ROLES_WITH_REUBICACIONES_PANEL.has(role);
}

export function userCanDecideAptitud(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    return ROLES_CAN_DECIDE_APTITUD.has(role);
}

export function userCanRegisterObservacion(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    return ROLES_CAN_REGISTER_OBSERVACION.has(role);
}

export function userCanModifyReubicacion(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    return ROLES_CAN_MODIFY.has(role);
}

export function getReubicacionesPermissions(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    const panels = Array.isArray(payload?.panels) ? payload.panels.map(String) : [];
    const hasPanel = panels.includes('reubicaciones') || ROLES_WITH_REUBICACIONES_PANEL.has(role);

    return {
        hasPanel,
        role,
        canDecideAptitud: ROLES_CAN_DECIDE_APTITUD.has(role),
        canRegisterObservacion: ROLES_CAN_REGISTER_OBSERVACION.has(role),
        canModify: ROLES_CAN_MODIFY.has(role)
    };
}