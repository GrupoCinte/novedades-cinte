import { useModuleTheme } from '../moduleTheme.js';

export default function CotizadorDashboard({ dashboard }) {
    const { cardPanel, subPanel, panelTitle, labelMuted, isLight } = useModuleTheme();
    const top = Array.isArray(dashboard?.top_cargos) ? dashboard.top_cargos : [];
    const ultimas = Array.isArray(dashboard?.ultimas) ? dashboard.ultimas : [];
    const statValue = isLight ? 'text-xl font-bold text-slate-900' : 'text-xl font-bold text-white';
    const blockTitle = isLight ? 'text-slate-700 font-subtitle font-semibold mb-2' : 'text-slate-300 font-subtitle font-semibold mb-2';
    const listText = isLight ? 'text-sm text-slate-700 space-y-1' : 'text-sm text-slate-300 space-y-1';

    return (
        <div className={cardPanel}>
            <h3 className={`${panelTitle} mb-3`}>Dashboard cotizador</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className={subPanel}>
                    <p className={`text-xs ${labelMuted}`}>Cotizaciones</p>
                    <p className={statValue}>{dashboard?.total_cot || 0}</p>
                </div>
                <div className={subPanel}>
                    <p className={`text-xs ${labelMuted}`}>Perfiles cotizados</p>
                    <p className={statValue}>{dashboard?.total_perfiles || 0}</p>
                </div>
                <div className={subPanel}>
                    <p className={`text-xs ${labelMuted}`}>Modo AUTO</p>
                    <p className={statValue}>{dashboard?.modo_stats?.AUTO || 0}</p>
                </div>
                <div className={subPanel}>
                    <p className={`text-xs ${labelMuted}`}>Modo MANUAL</p>
                    <p className={statValue}>{dashboard?.modo_stats?.MANUAL || 0}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={subPanel}>
                    <p className={blockTitle}>Top cargos</p>
                    <ul className={listText}>
                        {top.length === 0 && <li className={labelMuted}>Sin datos aún</li>}
                        {top.map(([cargo, count]) => (
                            <li key={cargo} className="flex justify-between">
                                <span>{cargo}</span>
                                <span className="font-bold">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={subPanel}>
                    <p className={blockTitle}>Últimas cotizaciones</p>
                    <ul className={`${listText} max-h-[220px] overflow-auto`}>
                        {ultimas.length === 0 && <li className={labelMuted}>Sin datos aún</li>}
                        {ultimas.map((it) => (
                            <li key={it.id} className="flex justify-between gap-2">
                                <span className="truncate">{it.cliente || 'Sin cliente'}</span>
                                <span>{it.fecha}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

