/**
 * Acceso a Mallas de turnos / Seguimiento: panel directorio (super_admin/cac) o rol GP (AUT-576 / AUT-283).
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

/** GP parcial: Mallas + Seguimiento (sin resto del Directorio). */
export function userIsGpMallasOnly(authOrToken) {
    return resolveRole(authOrToken) === 'gp' && !userHasDirectorioPanel(authOrToken);
}

export function userHasSeguimientoAccess(authOrToken) {
    return userHasMallasAccess(authOrToken);
}
