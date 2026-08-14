
import { userHasDirectorioPanel } from './directorioAccess';

function resolveRole(authOrToken) {
    if (!authOrToken || typeof authOrToken !== 'object') return '';
    return String(authOrToken?.user?.role || authOrToken?.claims?.role || '').trim().toLowerCase();
}

export function userIsChOnly(authOrToken) {
    const role = resolveRole(authOrToken);
    const isCh = role === 'admin_ch' || role === 'team_ch';
    return isCh && !userHasDirectorioPanel(authOrToken);
}

export function userHasChReubicacionesAccess(authOrToken) {
    const role = resolveRole(authOrToken);
    return role === 'admin_ch' || role === 'team_ch';
}