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
        const user = raw.user;
        const claims = raw.claims;

        if (user && typeof user === 'object') {
            return {
                role: user.role,
                panels: user.panels
            };
        }

        if (claims && typeof claims === 'object') {
            return claims;
        }

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

    const directRole = String(payload.role || payload['custom:role'] || '').trim().toLowerCase();
    if (directRole && ROLE_PRIORITY.includes(directRole)) return directRole;

    const groupsClaim = payload['cognito:groups'];
    const groupsArray = Array.isArray(groupsClaim)
        ? groupsClaim
        : groupsClaim
            ? [groupsClaim]
            : [];

    const normalized = new Set(
        groupsArray
            .filter(Boolean)
            .map((group) => String(group).trim().toLowerCase())
    );

    return ROLE_PRIORITY.find((role) => normalized.has(role)) || '';
}

function getReubicacionesAccessContext(authOrToken) {
    const payload = normalizePayload(authOrToken);
    if (!payload || typeof payload !== 'object') {
        return { payload: null, role: '', panels: [], hasPanel: false };
    }

    const role = resolveRoleFromTokenPayload(payload);
    const panels = Array.isArray(payload.panels) ? payload.panels.map(String) : [];
    const hasPanel = panels.includes('reubicaciones') || ROLES_WITH_REUBICACIONES_PANEL.has(role);

    return { payload, role, panels, hasPanel };
}

function hasRolePermission(authOrToken, allowedRoles) {
    const { role } = getReubicacionesAccessContext(authOrToken);
    return allowedRoles.has(role);
}

export function userHasReubicacionesPanel(authOrToken) {
    const { hasPanel } = getReubicacionesAccessContext(authOrToken);
    return hasPanel;
}

export function userCanDecideAptitud(authOrToken) {
    return hasRolePermission(authOrToken, ROLES_CAN_DECIDE_APTITUD);
}

export function userCanRegisterObservacion(authOrToken) {
    return hasRolePermission(authOrToken, ROLES_CAN_REGISTER_OBSERVACION);
}

export function userCanModifyReubicacion(authOrToken) {
    return hasRolePermission(authOrToken, ROLES_CAN_MODIFY);
}

export function getReubicacionesPermissions(authOrToken) {
    const { role, hasPanel } = getReubicacionesAccessContext(authOrToken);

    return {
        hasPanel,
        role,
        canDecideAptitud: ROLES_CAN_DECIDE_APTITUD.has(role),
        canRegisterObservacion: ROLES_CAN_REGISTER_OBSERVACION.has(role),
        canModify: ROLES_CAN_MODIFY.has(role)
    };
}