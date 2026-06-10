import { useMemo, useState } from 'react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import MallasTurnosPage from './MallasTurnosPage.jsx';

/**
 * Shell de Mallas en Directorio: pestañas superiores Mallas / Turnos nocturnos.
 */
const ROLE_PRIORITY = ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'nomina', 'comercial'];

function resolveDirectorioRole(auth) {
    const claims = auth?.claims && typeof auth.claims === 'object' ? auth.claims : {};
    const user = auth?.user && typeof auth.user === 'object' ? auth.user : {};
    const groups = claims['cognito:groups'] ?? user['cognito:groups'];
    const normalized = new Set(
        (Array.isArray(groups) ? groups : groups ? [groups] : []).map((g) => String(g || '').trim().toLowerCase())
    );
    const fromGroups = ROLE_PRIORITY.find((role) => normalized.has(role));
    if (fromGroups) return fromGroups;
    const raw = String(user.role || claims.role || claims['custom:role'] || '').trim().toLowerCase();
    return ROLE_PRIORITY.includes(raw) ? raw : '';
}

export default function MallasTurnosModule({ token, auth }) {
    const userRole = resolveDirectorioRole(auth);
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [subTab, setSubTab] = useState('mallas');

    const activeTabClass = isLight
        ? 'rounded-t-lg border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm'
        : 'rounded-t-lg border border-b-0 border-slate-600 bg-[#1e293b] px-4 py-2 text-sm font-semibold text-white shadow-sm';
    const inactiveTabClass = isLight
        ? 'rounded-t-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        : 'rounded-t-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200';
    const tabBtn = (active) => (active ? activeTabClass : inactiveTabClass);

    return (
        <div className={`${dash.moduleTabShellFull} font-body`}>
            <div
                className={`mb-0 flex shrink-0 flex-wrap gap-1 border-b ${isLight ? 'border-slate-200' : 'border-slate-700/60'}`}
                role="tablist"
                aria-label="Tipo de malla"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={subTab === 'mallas'}
                    className={tabBtn(subTab === 'mallas')}
                    onClick={() => setSubTab('mallas')}
                >
                    Mallas de turnos
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={subTab === 'nocturnos'}
                    className={tabBtn(subTab === 'nocturnos')}
                    onClick={() => setSubTab('nocturnos')}
                >
                    Turnos nocturnos
                </button>
            </div>
            <MallasTurnosPage
                key={subTab}
                token={token}
                userRole={userRole}
                variant={subTab}
            />
        </div>
    );
}
