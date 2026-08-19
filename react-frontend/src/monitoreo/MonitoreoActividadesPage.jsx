import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Download } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { monthCalendarRangeFromYm } from '../administracionDashboardAggregate.js';
import ModuleFiltersToolbar from '../shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from '../shared/filters/ModuleFiltersDrawer.jsx';
import SortableGestionDataTable from '../onboarding/SortableGestionDataTable.jsx';
import { fetchMonitoreoActividades, downloadMonitoreoPdf } from './monitoreoActividadesApi.js';
import MonitoreoActividadModal from './MonitoreoActividadModal.jsx';

function currentMonthValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date);
}

function formatDuration(inicio, fin) {
    if (!inicio || !fin) return '—';
    const ms = new Date(fin).getTime() - new Date(inicio).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}

function estadoBadge(estado) {
    const s = String(estado || '').toLowerCase();
    if (s === 'aprobado') return <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Aprobado</span>;
    if (s === 'rechazado') return <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Rechazado</span>;
    return <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Pendiente</span>;
}

const COLUMNS = [
    { key: 'consultor_nombre', label: 'Consultor', sortable: true },
    { key: 'cliente', label: 'Cliente', sortable: true },
    { key: 'descripcion', label: 'Descripción', sortable: false },
    { key: 'inicio', label: 'Inicio', sortable: true, render: (r) => formatDateTime(r.inicio) },
    { key: 'fin', label: 'Fin', sortable: true, render: (r) => formatDateTime(r.fin) },
    { key: 'duracion', label: 'Duración', sortable: false, render: (r) => formatDuration(r.inicio, r.fin) },
    { key: 'origen', label: 'Origen', sortable: true, render: (r) => <span className="capitalize">{r.origen || '—'}</span> },
    { key: 'estado', label: 'Estado', sortable: true, render: (r) => estadoBadge(r.estado) }
];

function sortRows(rows, sort) {
    if (!sort?.key) return rows;
    const sorted = [...rows].sort((a, b) => {
        let va = a[sort.key] ?? '';
        let vb = b[sort.key] ?? '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return -1;
        if (va > vb) return 1;
        return 0;
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
}

export default function MonitoreoActividadesPage() {
    const { isLight, field } = useModuleTheme();
    const dash = buildGestionTableDash(isLight);

    // Estado de filtros
    const [clienteValue, setClienteValue] = useState('');
    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerFilters, setDrawerFilters] = useState({ cliente: '', cedula: '', monthValue: currentMonthValue() });

    // Estado de datos
    const [allActivities, setAllActivities] = useState([]); // Actividades completas del mes
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useState({ key: 'inicio', dir: 'desc' });
    const [selectedRow, setSelectedRow] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadPdf = async () => {
        setIsDownloading(true);
        try {
            const range = monthCalendarRangeFromYm(monthValue);
            const blob = await downloadMonitoreoPdf({
                fechaDesde: range.desde,
                fechaHasta: range.hasta,
                cliente: clienteValue || undefined,
                cedula: drawerFilters.cedula || undefined
            });

            const safeMonth = range.desde ? String(range.desde).slice(0, 7) : 'actual';
            const fileName = `reporte_monitoreo_actividades_${safeMonth}.pdf`;
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error al descargar PDF:', err);
            alert(err.message || 'Error al generar el reporte PDF.');
        } finally {
            setIsDownloading(false);
        }
    };

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const loadActivities = useCallback(async (mes) => {
        setLoading(true);
        setError('');
        try {
            const range = monthCalendarRangeFromYm(mes);
            // Solo pedimos las actividades del mes, sin pre-filtrar cliente o cédula
            // Esto permite poblar correctamente los desplegables de filtros.
            const data = await fetchMonitoreoActividades({
                fechaDesde: range.desde,
                fechaHasta: range.hasta
            });
            setAllActivities(data);
        } catch (loadError) {
            setAllActivities([]);
            setError(loadError.message || 'No fue posible cargar las actividades.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Cargar solo cuando cambia el mes (a nivel global)
    useEffect(() => { void loadActivities(monthValue); }, [loadActivities, monthValue]);

    // Opciones derivadas de TODAS las actividades del mes (no desaparecen al filtrar)
    const clienteOptions = useMemo(() => {
        const seen = new Set();
        for (const item of allActivities) {
            const c = String(item?.cliente || '').trim();
            if (c) seen.add(c);
        }
        return [...seen].sort();
    }, [allActivities]);

    const consultorOptions = useMemo(() => {
        const seen = new Map();
        for (const item of allActivities) {
            const cliente = String(item?.cliente || '').trim();
            if (drawerFilters.cliente && cliente !== drawerFilters.cliente) continue;

            const cedula = String(item?.cedula || '').trim();
            if (cedula) seen.set(cedula, String(item?.consultor_nombre || cedula).trim() || cedula);
        }
        return [...seen.entries()].map(([cedula, nombre]) => ({ cedula, nombre }));
    }, [allActivities, drawerFilters.cliente]);

    useEffect(() => {
        if (drawerFilters.cedula) {
            const isValid = consultorOptions.some(c => c.cedula === drawerFilters.cedula);
            if (!isValid) {
                setDrawerFilters(f => ({ ...f, cedula: '' }));
            }
        }
    }, [consultorOptions, drawerFilters.cedula]);

    // Aplicar los filtros locales sobre la lista completa
    const filteredActivities = useMemo(() => {
        return allActivities.filter(a => {
            if (clienteValue && String(a.cliente || '').trim() !== clienteValue) return false;
            if (drawerFilters.cedula && String(a.cedula || '').trim() !== drawerFilters.cedula) return false;
            return true;
        });
    }, [allActivities, clienteValue, drawerFilters.cedula]);

    const sortedRows = useMemo(() => sortRows(filteredActivities, sort), [filteredActivities, sort]);

    // Resetear a página 1 cuando cambian los filtros o el ordenamiento
    useEffect(() => {
        setCurrentPage(1);
    }, [filteredActivities.length, sort.key, sort.dir]);

    // Calcular páginas
    const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
    const paginatedRows = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return sortedRows.slice(startIndex, startIndex + pageSize);
    }, [sortedRows, currentPage, pageSize]);

    // Chip label
    const activeFilterCount = (clienteValue ? 1 : 0) + (drawerFilters.cedula ? 1 : 0);
    const chipLabel = activeFilterCount ? `${activeFilterCount} filtro(s) activo(s)` : 'Sin filtros';

    // Sort handler
    const handleSort = (key) => {
        setSort((prev) => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    };

    // Drawer handlers
    const handleDrawerApply = () => {
        setClienteValue(drawerFilters.cliente);
        if (drawerFilters.monthValue !== monthValue) {
            setMonthValue(drawerFilters.monthValue);
        }
        setDrawerOpen(false);
    };

    const handleDrawerClear = () => {
        const empty = { cliente: '', cedula: '', monthValue: currentMonthValue() };
        setDrawerFilters(empty);
        setClienteValue('');
        if (monthValue !== currentMonthValue()) {
            setMonthValue(currentMonthValue());
        }
        setDrawerOpen(false);
    };

    const handleClienteInlineChange = (e) => {
        const val = e.target.value;
        setClienteValue(val);
        setDrawerFilters((f) => ({ ...f, cliente: val }));
    };

    const handleMonthInlineChange = (e) => {
        const val = e.target.value;
        setMonthValue(val);
        setDrawerFilters((f) => ({ ...f, monthValue: val }));
    };

    return (
        <section className="w-full space-y-3">
            {/* Barra de filtros inline: Cliente + Mes */}
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold">
                    Cliente
                    <select className={`${field} min-w-[10rem]`} value={clienteValue} onChange={handleClienteInlineChange}>
                        <option value="">Todos los clientes</option>
                        {clienteOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                    Mes
                    <input type="month" className={field} value={monthValue} onChange={handleMonthInlineChange} />
                </label>
            </div>

            {/* Toolbar con chip + botón de filtros avanzados */}
            <ModuleFiltersToolbar
                chipLabel={chipLabel}
                filtersPanelOpen={drawerOpen}
                onToggleFilters={() => setDrawerOpen((o) => !o)}
                dash={dash}
            >
                <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isDownloading || filteredActivities.length === 0}
                    className={
                        isLight
                            ? 'ml-auto inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50'
                            : 'ml-auto inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-[#088DC6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#088DC6]/80 disabled:opacity-50'
                    }
                    title={filteredActivities.length === 0 ? 'No hay actividades para exportar' : 'Descargar reporte PDF'}
                >
                    <Download size={16} className={isDownloading ? 'animate-pulse' : ''} />
                    <span className="hidden sm:inline">{isDownloading ? 'Generando...' : 'Descargar PDF'}</span>
                </button>
            </ModuleFiltersToolbar>

            {/* Drawer de filtros avanzados */}
            <ModuleFiltersDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onClear={handleDrawerClear}
                onApply={handleDrawerApply}
                dash={dash}
            >
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Cliente
                    <select className={field} value={drawerFilters.cliente} onChange={(e) => setDrawerFilters((f) => ({ ...f, cliente: e.target.value }))}>
                        <option value="">Todos los clientes</option>
                        {clienteOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </label>
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Consultor
                    <select className={field} value={drawerFilters.cedula} onChange={(e) => setDrawerFilters((f) => ({ ...f, cedula: e.target.value }))}>
                        <option value="">Todos los consultores</option>
                        {consultorOptions.map(({ cedula, nombre }) => <option key={cedula} value={cedula}>{nombre} · {cedula}</option>)}
                    </select>
                </label>
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Mes
                    <input type="month" className={field} value={drawerFilters.monthValue} onChange={(e) => setDrawerFilters((f) => ({ ...f, monthValue: e.target.value }))} />
                </label>
            </ModuleFiltersDrawer>

            {/* Estados de carga / error / vacío / tabla */}
            {loading && <div className={`${dash.card} px-4 py-10 text-center text-sm`}>Cargando actividades…</div>}

            {!loading && error && <div className={`${dash.card} border-rose-400/50 px-4 py-6 text-center text-sm text-rose-600`}>{error}</div>}

            {!loading && !error && filteredActivities.length === 0 && (
                <div className={`flex flex-col items-center gap-3 py-12 text-center ${dash.card} px-4`}>
                    <Activity size={30} className="text-[#65BCF7]" />
                    <div>
                        <h2 className={dash.titleXl}>No hay actividades para los filtros seleccionados</h2>
                        <p className={`mt-1 text-sm ${dash.muted}`}>Prueba con otro mes o cliente.</p>
                    </div>
                </div>
            )}

            {!loading && !error && filteredActivities.length > 0 && (
                <SortableGestionDataTable
                    columns={COLUMNS}
                    rows={paginatedRows}
                    isLight={isLight}
                    sort={sort}
                    onSort={handleSort}
                    onRowClick={(row) => setSelectedRow(row)}
                    emptyText="No hay actividades para los filtros seleccionados"
                    footer={
                        <div className={`flex flex-wrap items-center justify-between gap-4 p-4 border-t ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700/50 bg-slate-800'}`}>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Mostrar</span>
                                <select
                                    className={field}
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                >
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                                <span className={`text-sm font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>registros</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`text-sm font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                    Página {currentPage} de {totalPages}
                                </span>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        className={`px-3 py-1.5 text-sm font-semibold rounded-md border transition-colors ${
                                            currentPage === 1
                                                ? 'opacity-50 cursor-not-allowed ' + (isLight ? 'border-slate-200 text-slate-400' : 'border-slate-700 text-slate-500')
                                                : isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'border-slate-600 text-slate-200 hover:bg-slate-700'
                                        }`}
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        className={`px-3 py-1.5 text-sm font-semibold rounded-md border transition-colors ${
                                            currentPage >= totalPages
                                                ? 'opacity-50 cursor-not-allowed ' + (isLight ? 'border-slate-200 text-slate-400' : 'border-slate-700 text-slate-500')
                                                : isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'border-slate-600 text-slate-200 hover:bg-slate-700'
                                        }`}
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        </div>
                    }
                />
            )}

            {/* Modal de detalle */}
            {selectedRow && (
                <MonitoreoActividadModal
                    actividad={selectedRow}
                    onClose={() => setSelectedRow(null)}
                    onUpdated={() => void loadActivities(monthValue)}
                    isLight={isLight}
                />
            )}
        </section>
    );
}
