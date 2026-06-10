import { useMemo, useState } from 'react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import MallasTurnosPage from './MallasTurnosPage.jsx';

/**
 * Shell de Mallas en Directorio: pestañas superiores Mallas / Turnos nocturnos.
 */
export default function MallasTurnosModule({ token }) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [subTab, setSubTab] = useState('mallas');

    const tabBtn = (active) =>
        active
            ? isLight
                ? 'rounded-t-lg border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm'
                : 'rounded-t-lg border border-b-0 border-slate-600 bg-[#1e293b] px-4 py-2 text-sm font-semibold text-white shadow-sm'
            : isLight
              ? 'rounded-t-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              : 'rounded-t-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200';

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
                variant={subTab === 'nocturnos' ? 'nocturnos' : 'mallas'}
            />
        </div>
    );
}
