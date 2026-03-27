export default function CotizadorDashboard({ dashboard }) {
    const top = Array.isArray(dashboard?.top_cargos) ? dashboard.top_cargos : [];
    const ultimas = Array.isArray(dashboard?.ultimas) ? dashboard.ultimas : [];

    return (
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-bold mb-3">Dashboard cotizador</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-900/50 border border-slate-700 rounded p-3">
                    <p className="text-xs text-slate-400">Cotizaciones</p>
                    <p className="text-xl font-bold text-white">{dashboard?.total_cot || 0}</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-700 rounded p-3">
                    <p className="text-xs text-slate-400">Perfiles cotizados</p>
                    <p className="text-xl font-bold text-white">{dashboard?.total_perfiles || 0}</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-700 rounded p-3">
                    <p className="text-xs text-slate-400">Modo AUTO</p>
                    <p className="text-xl font-bold text-white">{dashboard?.modo_stats?.AUTO || 0}</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-700 rounded p-3">
                    <p className="text-xs text-slate-400">Modo MANUAL</p>
                    <p className="text-xl font-bold text-white">{dashboard?.modo_stats?.MANUAL || 0}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/40 border border-slate-700 rounded p-3">
                    <p className="text-slate-300 font-semibold mb-2">Top cargos</p>
                    <ul className="text-sm text-slate-300 space-y-1">
                        {top.length === 0 && <li className="text-slate-500">Sin datos aún</li>}
                        {top.map(([cargo, count]) => (
                            <li key={cargo} className="flex justify-between">
                                <span>{cargo}</span>
                                <span className="font-bold">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="bg-slate-900/40 border border-slate-700 rounded p-3">
                    <p className="text-slate-300 font-semibold mb-2">Últimas cotizaciones</p>
                    <ul className="text-sm text-slate-300 space-y-1 max-h-[220px] overflow-auto">
                        {ultimas.length === 0 && <li className="text-slate-500">Sin datos aún</li>}
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

