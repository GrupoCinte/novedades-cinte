import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import NovedadesFiltersToolbar from '../novedades/NovedadesFiltersToolbar.jsx';

function filaCoincideBusqueda(it, raw) {
    const q = String(raw || '').trim().toLowerCase();
    if (!q) return true;
    const idStr = String(it?.id ?? '');
    const codigo = String(it?.codigo || '').trim().toLowerCase();
    const cliente = String(it?.cliente || '').trim().toLowerCase();
    const comercial = String(it?.comercial || '').trim().toLowerCase();
    const titulo = String(it?.titulo || '').trim().toLowerCase();
    if (idStr === q || codigo === q) return true;
    return codigo.includes(q) || idStr.includes(q) || cliente.includes(q) || comercial.includes(q) || titulo.includes(q);
}

function totalCotizacion(it) {
    const subtotal = (it?.resultados || []).reduce(
        (acc, r) => acc + Number(r?.tarifa_mes || 0) * Number(r?.cantidad || 1) * Number(it?.meses || 1),
        0
    );
    return subtotal * 1.19;
}

export default function CotizadorHistorial({
    historial,
    onSelect,
    onNuevaCotizacion
}) {
    const baseDash = useModuleTheme();
    const { isLight, fieldInput } = baseDash;
    const dash = { ...baseDash, ...buildGestionTableDash(isLight) };

    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('Todos');
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

    const filtrado = useMemo(() => {
        const rows = Array.isArray(historial) ? historial : [];
        return rows
            .filter((it) => {
                if (filtroEstado !== 'Todos' && (it.estado || 'Borrador') !== filtroEstado) return false;
                return filaCoincideBusqueda(it, busqueda);
            });
    }, [historial, busqueda, filtroEstado]);

    const getEstadoChipClass = (estado) => {
        const est = String(estado || 'Borrador').toLowerCase();
        if (est === 'aceptada') {
            return isLight 
                ? 'border-emerald-300 bg-emerald-100 text-emerald-900' 
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
        }
        if (est === 'enviada') {
            return isLight 
                ? 'border-sky-300 bg-sky-100 text-sky-900' 
                : 'border-sky-500/30 bg-sky-500/10 text-sky-400';
        }
        return isLight 
            ? 'border-slate-300 bg-slate-100 text-slate-900' 
            : 'border-slate-600/40 bg-slate-800/60 text-slate-300';
    };

    const chipLabel = (busqueda || filtroEstado !== 'Todos') 
        ? 'Filtros activos' 
        : 'Sin filtros activos';

    return (
        <div className={`${dash.novedadesTabShellFull} h-full flex flex-col`}>
            <NovedadesFiltersToolbar
                chipLabel={chipLabel}
                filtersPanelOpen={filtersPanelOpen}
                onToggleFilters={() => setFiltersPanelOpen((o) => !o)}
                toggleId="cotizador-filtros-avanzados-toggle"
                dash={dash}
            >
                <input
                    type="search"
                    enterKeyHint="search"
                    placeholder="Buscar por título..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className={`${fieldInput} w-[min(100%,11rem)] max-w-[13rem] shrink-0 text-sm`}
                />
                <button
                    type="button"
                    onClick={onNuevaCotizacion}
                    className={dash.filtrosAvanzadosBtn}
                    aria-label="Crear cotización"
                >
                    <span className="hidden sm:inline">Crear cotización</span>
                    <span className="sm:hidden">Crear</span>
                </button>
            </NovedadesFiltersToolbar>

            {filtersPanelOpen && (
                <div className="mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="w-full sm:w-1/3">
                        <label className={`block text-xs font-semibold mb-1 ${dash.labelMuted}`}>Estado</label>
                        <select
                            className={`${dash.fieldInput} w-full`}
                            value={filtroEstado}
                            onChange={(e) => setFiltroEstado(e.target.value)}
                        >
                            <option value="Todos">Todos los estados</option>
                            <option value="Borrador">Borrador</option>
                            <option value="Enviada">Enviada</option>
                            <option value="Aceptada">Aceptada</option>
                        </select>
                    </div>
                </div>
            )}

            <div className={`min-h-0 flex-1 flex flex-col ${dash.tableSurface}`}>
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px] md:min-w-full">
                        <thead className={`sticky top-0 z-10 shadow-sm ${dash.tableThead}`}>
                            <tr>
                                <th className="p-4 pl-6 font-semibold uppercase tracking-wider text-xs">Número</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Cliente</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Título / Asunto</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-right">Total (con IVA)</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-center">Estado</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Plazo</th>
                                <th className="p-4 pr-6 font-semibold uppercase tracking-wider text-xs text-right">Creada</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {filtrado.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className={`p-12 text-center font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                        {busqueda.trim() || filtroEstado !== 'Todos'
                                            ? 'Ninguna cotización coincide con los filtros.'
                                            : 'No hay cotizaciones guardadas todavía.'}
                                    </td>
                                </tr>
                            ) : null}
                            {filtrado.map((it) => {
                                const moneda = it.moneda || it.resultados?.[0]?.moneda || 'COP';
                                const total = totalCotizacion(it);
                                const estado = it.estado || 'Borrador';
                                return (
                                    <tr 
                                        key={it.id} 
                                        className={`${dash.tableBodyRow} cursor-pointer transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#0f2942]/40'}`}
                                        onClick={() => onSelect?.(it)}
                                    >
                                        <td className={`p-4 pl-6 font-mono font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{it.codigo || it.id}</td>
                                        <td className="p-4 font-medium">{it.cliente || '-'}</td>
                                        <td className="p-4 truncate max-w-[200px]" title={it.titulo}>{it.titulo || '—'}</td>
                                        <td className="p-4 text-right tabular-nums font-semibold">{formatMoney(total, moneda)}</td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${getEstadoChipClass(estado)}`}>
                                                {estado}
                                            </span>
                                        </td>
                                        <td className="p-4 whitespace-nowrap">{it.plazo ? `${it.plazo} días` : '-'}</td>
                                        <td className={`p-4 pr-6 text-right whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                            {it.fecha ? String(it.fecha).split(',')[0] : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

