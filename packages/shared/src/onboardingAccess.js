import ROLE_PRIORITY from './constants/rolePriority.json';

/** Roles con acceso al panel "onboarding" (debe coincidir con src/rbac.js POLICY). */
const ROLES_WITH_ONBOARDING_PANEL = new Set([
    'super_admin',
    'admin_ch',
    'team_ch',
    'cac',
    'gp',
    'nomina'
]);

/** Roles que pueden tramitar bajas / editar maestros (escritura). */
const ROLES_WITH_ONBOARDING_WRITE = new Set(['super_admin', 'admin_ch', 'cac']);

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
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

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

export function userHasOnboardingPanel(authOrToken) {
    const payload = normalizePayload(authOrToken);
    if (!payload) return false;
    const role = resolveRoleFromTokenPayload(payload);
    const panels = Array.isArray(payload.panels) ? payload.panels.map((p) => String(p)) : [];
    if (panels.includes('onboarding')) return true;
    return ROLES_WITH_ONBOARDING_PANEL.has(role);
}

export function getOnboardingPermissions(authOrToken) {
    const payload = normalizePayload(authOrToken);
    const role = resolveRoleFromTokenPayload(payload);
    const panels = Array.isArray(payload?.panels) ? payload.panels.map((p) => String(p)) : [];
    const hasPanel = panels.includes('onboarding') || ROLES_WITH_ONBOARDING_PANEL.has(role);
    const canWrite = ROLES_WITH_ONBOARDING_WRITE.has(role);
    const canTramitarBaja = ROLES_WITH_ONBOARDING_WRITE.has(role); // team_ch NO
    const canEditFicha = canWrite || role === 'team_ch';
    return { hasPanel, canWrite, canTramitarBaja, canEditFicha, role };
}
