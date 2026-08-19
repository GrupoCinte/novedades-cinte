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

function currentYmBogota() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function defaultDateRange() {
    return monthCalendarRangeFromYm(currentYmBogota());
}

function emptyDraftFilters() {
    const range = defaultDateRange();
    return { cliente: '', cedula: '', fechaDesde: range.desde, fechaHasta: range.hasta };
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

const COLUMNS = [
    { key: 'consultor_nombre', label: 'Consultor', sortable: true },
    { key: 'cliente', label: 'Cliente', sortable: true },
    { key: 'descripcion', label: 'Descripción', sortable: false },
    { key: 'inicio', label: 'Inicio', sortable: true, render: (r) => formatDateTime(r.inicio) },
    { key: 'fin', label: 'Fin', sortable: true, render: (r) => formatDateTime(r.fin) },
    { key: 'duracion', label: 'Duración', sortable: false, render: (r) => formatDuration(r.inicio, r.fin) },
    { key: 'origen', label: 'Origen', sortable: true, render: (r) => <span className="capitalize">{r.origen || '—'}</span> }
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
    const defaultRange = defaultDateRange();

    const [appliedFilters, setAppliedFilters] = useState(() => emptyDraftFilters());
    const [drawerFilters, setDrawerFilters] = useState(() => emptyDraftFilters());
    const [drawerOpen, setDrawerOpen] = useState(false);

    const [allActivities, setAllActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [sort, setSort] = useState({ key: 'inicio', dir: 'desc' });
    const [selectedRow, setSelectedRow] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const loadActivities = useCallback(async (filters) => {
        setLoading(true);
        setError('');
        setActionError('');
        try {
            const data = await fetchMonitoreoActividades({
                fechaDesde: filters.fechaDesde,
                fechaHasta: filters.fechaHasta
            });
            setAllActivities(data);
        } catch (loadError) {
            setAllActivities([]);
            setError(loadError.message || 'No fue posible cargar las actividades.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadActivities(appliedFilters);
    }, [loadActivities, appliedFilters]);

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
            const cedula = String(item?.cedula || '').trim();
            if (cedula) seen.set(cedula, String(item?.consultor_nombre || cedula).trim() || cedula);
        }
        return [...seen.entries()].map(([cedula, nombre]) => ({ cedula, nombre }));
    }, [allActivities]);

    const filteredActivities = useMemo(() => {
        return allActivities.filter((a) => {
            if (appliedFilters.cliente && String(a.cliente || '').trim() !== appliedFilters.cliente) return false;
            if (appliedFilters.cedula && String(a.cedula || '').trim() !== appliedFilters.cedula) return false;
            return true;
        });
    }, [allActivities, appliedFilters.cliente, appliedFilters.cedula]);

    const sortedRows = useMemo(() => sortRows(filteredActivities, sort), [filteredActivities, sort]);

    useEffect(() => {
        setCurrentPage(1);
    }, [appliedFilters.cliente, appliedFilters.cedula, appliedFilters.fechaDesde, appliedFilters.fechaHasta, sort.key, sort.dir, pageSize]);

    const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
    const paginatedRows = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return sortedRows.slice(startIndex, startIndex + pageSize);
    }, [sortedRows, currentPage, pageSize]);

    const rangeIsDefault =
        appliedFilters.fechaDesde === defaultRange.desde && appliedFilters.fechaHasta === defaultRange.hasta;
    const activeFilterCount =
        (appliedFilters.cliente ? 1 : 0) + (appliedFilters.cedula ? 1 : 0) + (rangeIsDefault ? 0 : 1);
    const chipLabel = activeFilterCount ? `${activeFilterCount} filtro(s) activo(s)` : 'Sin filtros';

    const handleSort = (key) => {
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    };

    const handleDrawerApply = () => {
        const desde = String(drawerFilters.fechaDesde || '').trim();
        const hasta = String(drawerFilters.fechaHasta || '').trim();
        if (desde && hasta && desde > hasta) {
            setActionError('La fecha inicio no puede ser posterior a la fecha fin.');
            return;
        }
        setActionError('');
        setAppliedFilters({ ...drawerFilters, fechaDesde: desde, fechaHasta: hasta });
        setDrawerOpen(false);
    };

    const handleDrawerClear = () => {
        const empty = emptyDraftFilters();
        setDrawerFilters(empty);
        setAppliedFilters(empty);
        setError('');
        setActionError('');
        setDrawerOpen(false);
    };

    const handleDownloadPdf = async () => {
        setIsDownloading(true);
        setActionError('');
        try {
            const blob = await downloadMonitoreoPdf({
                fechaDesde: appliedFilters.fechaDesde || undefined,
                fechaHasta: appliedFilters.fechaHasta || undefined,
                cliente: appliedFilters.cliente || undefined,
                cedula: appliedFilters.cedula || undefined
            });

            const safeMonth = appliedFilters.fechaDesde ? String(appliedFilters.fechaDesde).slice(0, 7) : 'actual';
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
            setActionError(err.message || 'Error al generar el reporte PDF.');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <section className="w-full space-y-3">
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

            <ModuleFiltersDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onClear={handleDrawerClear}
                onApply={handleDrawerApply}
                dash={dash}
            >
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Cliente
                    <select
                        className={field}
                        value={drawerFilters.cliente}
                        onChange={(e) => setDrawerFilters((f) => ({ ...f, cliente: e.target.value }))}
                    >
                        <option value="">Todos los clientes</option>
                        {clienteOptions.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Consultor
                    <select
                        className={field}
                        value={drawerFilters.cedula}
                        onChange={(e) => setDrawerFilters((f) => ({ ...f, cedula: e.target.value }))}
                    >
                        <option value="">Todos los consultores</option>
                        {consultorOptions.map(({ cedula, nombre }) => (
                            <option key={cedula} value={cedula}>
                                {nombre} · {cedula}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Fecha inicio
                    <input
                        type="date"
                        className={field}
                        value={drawerFilters.fechaDesde}
                        onChange={(e) => setDrawerFilters((f) => ({ ...f, fechaDesde: e.target.value }))}
                    />
                </label>
                <label className={`flex flex-col gap-1.5 ${dash.filtrosDrawerLabel}`}>
                    Fecha fin
                    <input
                        type="date"
                        className={field}
                        value={drawerFilters.fechaHasta}
                        onChange={(e) => setDrawerFilters((f) => ({ ...f, fechaHasta: e.target.value }))}
                    />
                </label>
            </ModuleFiltersDrawer>

            {loading && <div className={`${dash.card} px-4 py-10 text-center text-sm`}>Cargando actividades…</div>}

            {!loading && error && (
                <div className={`${dash.card} border-rose-400/50 px-4 py-6 text-center text-sm text-rose-600`}>{error}</div>
            )}

            {actionError && (
                <div className={`${dash.card} border-rose-400/50 px-4 py-3 text-center text-sm text-rose-600`}>{actionError}</div>
            )}

            {!loading && !error && filteredActivities.length === 0 && (
                <div className={`flex flex-col items-center gap-3 py-12 text-center ${dash.card} px-4`}>
                    <Activity size={30} className="text-[#65BCF7]" />
                    <div>
                        <h2 className={dash.titleXl}>No hay actividades para los filtros seleccionados</h2>
                        <p className={`mt-1 text-sm ${dash.muted}`}>Prueba con otro rango de fechas o cliente.</p>
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

            {selectedRow && (
                <MonitoreoActividadModal
                    actividad={selectedRow}
                    onClose={() => setSelectedRow(null)}
                    isLight={isLight}
                />
            )}
        </section>
    );
}
