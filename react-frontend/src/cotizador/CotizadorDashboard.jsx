import { FileText, Layers, Zap, PenLine } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';

export default function CotizadorDashboard({ dashboard }) {
    const { cardPanel, subPanel, panelTitle, labelMuted, isLight } = useModuleTheme();
    const top = Array.isArray(dashboard?.top_cargos) ? dashboard.top_cargos : [];
    const ultimas = Array.isArray(dashboard?.ultimas) ? dashboard.ultimas : [];
    const statValue = isLight ? 'text-2xl font-black font-heading text-slate-900' : 'text-2xl font-black font-heading text-white';
    const blockTitle = isLight ? 'text-slate-700 font-subtitle font-semibold mb-2' : 'text-slate-300 font-subtitle font-semibold mb-2';
    const listText = isLight ? 'text-sm text-slate-700 space-y-1' : 'text-sm text-slate-300 space-y-1';
    const iconTile = isLight
        ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-[#088DC6]'
        : 'flex h-10 w-10 items-center justify-center rounded-lg bg-[#088DC6]/15 text-[#65BCF7]';

    const kpis = [
        { label: 'Cotizaciones', value: dashboard?.total_cot || 0, icon: FileText },
        { label: 'Perfiles cotizados', value: dashboard?.total_perfiles || 0, icon: Layers },
        { label: 'Modo AUTO', value: dashboard?.modo_stats?.AUTO || 0, icon: Zap },
        { label: 'Modo MANUAL', value: dashboard?.modo_stats?.MANUAL || 0, icon: PenLine }
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpis.map(({ label, value, icon: Icon }) => (
                    <div key={label} className={`${cardPanel} flex items-center gap-3`}>
                        <div className={iconTile}>
                            <Icon size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className={`text-xs ${labelMuted} truncate`}>{label}</p>
                            <p className={statValue}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={cardPanel}>
                    <h3 className={`${panelTitle} mb-3`}>Top cargos</h3>
                    <ul className={listText}>
                        {top.length === 0 && <li className={labelMuted}>Sin datos aún</li>}
                        {top.map(([cargo, count]) => (
                            <li key={cargo} className={`flex justify-between gap-2 rounded ${subPanel}`}>
                                <span className="truncate">{cargo}</span>
                                <span className="font-bold shrink-0">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={cardPanel}>
                    <h3 className={`${panelTitle} mb-3`}>Últimas cotizaciones</h3>
                    <ul className={`${listText} max-h-[260px] overflow-auto`}>
                        {ultimas.length === 0 && <li className={labelMuted}>Sin datos aún</li>}
                        {ultimas.map((it) => (
                            <li key={it.id} className={`flex justify-between gap-2 rounded ${subPanel}`}>
                                <span className="truncate">{it.cliente || 'Sin cliente'}</span>
                                <span className={`shrink-0 ${labelMuted}`}>{it.fecha}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
