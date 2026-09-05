import { normalizePayload } from './comercialAccess';
import { resolveRoleFromTokenPayload } from './contratacion/contratacionAccess.js';

function getReubicacionesRole(auth) {
    const payload = normalizePayload(auth);
    return resolveRoleFromTokenPayload(payload);
}

export function userHasReubicacionesAccess(auth) {
    const role = getReubicacionesRole(auth);
    return ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'atraccion_talento'].includes(role);
}

export function canEditReubicaciones(auth) {
    const role = getReubicacionesRole(auth);
    if (role === 'atraccion_talento') return false;
    // Todos los roles con acceso tienen permisos de edición de los datos generales en su alcance
    return userHasReubicacionesAccess(auth);
}

export function canDeleteReubicaciones(auth) {
    const role = getReubicacionesRole(auth);
    return ['super_admin', 'admin_ch'].includes(role);
}

export function canRegisterObservacion(auth) {
    const role = getReubicacionesRole(auth);
    return ['super_admin', 'admin_ch', 'team_ch'].includes(role);
}

export function canDecideAptitud(auth) {
    const role = getReubicacionesRole(auth);
    return ['super_admin', 'gp'].includes(role);
}
