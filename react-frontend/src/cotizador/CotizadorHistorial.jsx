import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import NovedadesFiltersToolbar from '../novedades/NovedadesFiltersToolbar.jsx';
import ModuleFiltersDrawer from '../shared/filters/ModuleFiltersDrawer.jsx';

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
    onNuevaCotizacion,
    initialFilters = {}
}) {
    const baseDash = useModuleTheme();
    const { isLight, fieldInput } = baseDash;
    const dash = { ...baseDash, ...buildGestionTableDash(isLight) };

    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState(initialFilters.estado || 'Todos');
    const [filtroCliente, setFiltroCliente] = useState(initialFilters.cliente || '');
    const [filtroComercial, setFiltroComercial] = useState(initialFilters.comercial || '');
    const [fechaDesde, setFechaDesde] = useState(initialFilters.fechaDesde || '');
    const [fechaHasta, setFechaHasta] = useState(initialFilters.fechaHasta || '');
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

    const clientesUnicos = useMemo(() => {
        const rows = Array.isArray(historial) ? historial : [];
        const setC = new Set();
        rows.forEach(it => {
            if (it.cliente) setC.add(it.cliente);
        });
        return Array.from(setC).sort();
    }, [historial]);

    const comercialesUnicos = useMemo(() => {
        const rows = Array.isArray(historial) ? historial : [];
        const setC = new Set();
        rows.forEach(it => {
            if (it.comercial) setC.add(it.comercial);
        });
        return Array.from(setC).sort();
    }, [historial]);

    const handleClearFilters = () => {
        setFiltroEstado('Todos');
        setFiltroCliente('');
        setFiltroComercial('');
        setFechaDesde('');
        setFechaHasta('');
    };

    const filtrado = useMemo(() => {
        const rows = Array.isArray(historial) ? historial : [];
        return rows
            .filter((it) => {
                if (filtroEstado !== 'Todos' && (it.estado || 'Borrador') !== filtroEstado) return false;
                if (filtroCliente && it.cliente !== filtroCliente) return false;
                if (filtroComercial && it.comercial !== filtroComercial) return false;

                if (fechaDesde || fechaHasta) {
                    const dtStr = it.fecha_generacion_iso || it.fecha;
                    if (dtStr) {
                        const cotDate = new Date(dtStr);
                        if (!isNaN(cotDate.getTime())) {
                            cotDate.setHours(0, 0, 0, 0);
                            if (fechaDesde) {
                                const dDesde = new Date(fechaDesde);
                                dDesde.setHours(0, 0, 0, 0);
                                if (cotDate < dDesde) return false;
                            }
                            if (fechaHasta) {
                                const dHasta = new Date(fechaHasta);
                                dHasta.setHours(23, 59, 59, 999);
                                if (cotDate > dHasta) return false;
                            }
                        }
                    }
                }

                return filaCoincideBusqueda(it, busqueda);
            });
    }, [historial, busqueda, filtroEstado, filtroCliente, filtroComercial, fechaDesde, fechaHasta]);

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
        if (est === 'rechazada') {
            return isLight
                ? 'border-rose-300 bg-rose-100 text-rose-900'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-400';
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

            <ModuleFiltersDrawer
                open={filtersPanelOpen}
                onClose={() => setFiltersPanelOpen(false)}
                onClear={handleClearFilters}
                onApply={() => setFiltersPanelOpen(false)}
                dash={dash}
                title="Filtros avanzados"
            >
                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Estado</label>
                    <select
                        className={`${dash.field} w-full text-sm`}
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value)}
                    >
                        <option value="Todos">Todos los estados</option>
                        <option value="Borrador">Borrador</option>
                        <option value="Enviada">Enviada</option>
                        <option value="Aceptada">Aceptada</option>
                        <option value="Rechazada">Rechazada</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Cliente</label>
                    <select
                        className={`${dash.field} w-full text-sm`}
                        value={filtroCliente}
                        onChange={(e) => setFiltroCliente(e.target.value)}
                    >
                        <option value="">Todos los clientes</option>
                        {clientesUnicos.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Comercial</label>
                    <select
                        className={`${dash.field} w-full text-sm`}
                        value={filtroComercial}
                        onChange={(e) => setFiltroComercial(e.target.value)}
                    >
                        <option value="">Todos los comerciales</option>
                        {comercialesUnicos.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className={dash.filtrosDrawerLabel}>Rango de fechas</span>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            className={`${dash.field} min-w-0 flex-1 px-2 py-1.5 text-sm`}
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                        />
                        <span className={`${dash.modalMuted || 'text-slate-500'} shrink-0 text-xs`}>a</span>
                        <input
                            type="date"
                            className={`${dash.field} min-w-0 flex-1 px-2 py-1.5 text-sm`}
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                        />
                    </div>
                </div>
            </ModuleFiltersDrawer>

            <div className={`min-h-0 flex-1 flex flex-col ${dash.tableSurface}`}>
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px] md:min-w-full">
                        <thead className={`sticky top-0 z-10 shadow-sm ${dash.tableThead}`}>
                            <tr>
                                <th className="p-4 pl-6 font-semibold uppercase tracking-wider text-xs">Número</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Cliente</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Comercial</th>
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
                                    <td colSpan={8} className={`p-12 text-center font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
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
                                        <td className="p-4 font-medium truncate max-w-[150px]">{it.comercial || '-'}</td>
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

