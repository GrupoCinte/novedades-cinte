/**
 * Acceso a Mallas de turnos: panel directorio (super_admin/cac) o rol GP (AUT-576).
 */

import { getPanelsFromToken } from './comercialAccess';
import { userHasDirectorioPanel } from './directorioAccess';

function resolveRole(authOrToken) {
    if (!authOrToken || typeof authOrToken !== 'object') return '';
    return String(authOrToken?.user?.role || authOrToken?.claims?.role || '').trim().toLowerCase();
}

export function userHasMallasAccess(authOrToken) {
    if (userHasDirectorioPanel(authOrToken)) return true;
    if (resolveRole(authOrToken) === 'gp') return true;
    // Token JWT crudo (string) con panels — GP no tiene panel directorio.
    if (typeof authOrToken === 'string' || authOrToken?.token) {
        const panels = getPanelsFromToken(authOrToken);
        if (panels.includes('directorio')) return true;
    }
    return false;
}

export function userIsGpMallasOnly(authOrToken) {
    return resolveRole(authOrToken) === 'gp' && !userHasDirectorioPanel(authOrToken);
}

/**
 * Valida si el usuario tiene permiso para acceder a Seguimiento a Consultores (AUT-283).
 * Autorizados: gp, cac, super_admin.
 */
export function userHasSeguimientoAccess(authOrToken) {
    const role = resolveRole(authOrToken);
    return ['gp', 'cac', 'super_admin'].includes(role);
}
