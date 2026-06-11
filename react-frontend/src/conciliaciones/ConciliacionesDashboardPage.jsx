import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Search } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { nativeCalendarOnlyInputProps } from '../nativeCalendarOnlyInputProps.js';
import { buildGestionTableDash, GESTION_SEARCH_FIELD_WIDTH } from '../gestionTableDashTheme.js';
import ModuleFiltersToolbar from '../shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from '../shared/filters/ModuleFiltersDrawer.jsx';
import ConciliacionesPageHeader from './components/ConciliacionesPageHeader.jsx';
import ConciliacionesSlaTierResumen from './components/ConciliacionesSlaTierResumen.jsx';
import ConciliacionesCierresTable from './components/ConciliacionesCierresTable.jsx';
import { CONCILIACIONES_PAGE_MAIN, conciliacionesErrorBannerClass } from './conciliacionesLayout.js';
import { fetchConciliacionesCierresProximos } from './conciliacionesApi.js';
import { aggregateSlaTierCounts, cierreVisualState } from './conciliacionesCierreVisual.js';

function currentMonthValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function parseMonthValue(v) {
    const s = String(v || '').trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return { year: null, month: null };
    return { year: Number(m[1]), month: Number(m[2]) };
}

function formatHoyEs(iso) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!p) return '';
    return `${Number(p[3])}/${Number(p[2])}/${p[1]}`;
}

function foldCliente(s) {
    return String(s || '')
        .trim()
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}

export default function ConciliacionesDashboardPage({ token }) {
    const navigate = useNavigate();
    const mt = useModuleTheme();
    const { isLight, labelMuted, field } = mt;
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [payload, setPayload] = useState(null);
    const [search, setSearch] = useState('');
    const [filterSlaTier, setFilterSlaTier] = useState('');
    const [filterSoloSinConfig, setFilterSoloSinConfig] = useState(false);
    const [filterSoloSlaAlert, setFilterSoloSlaAlert] = useState(false);
    const [pageSize, setPageSize] = useState(20);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const ym = useMemo(() => parseMonthValue(monthValue), [monthValue]);

    const load = useCallback(async () => {
        if (!ym.year || !ym.month) return;
        setLoading(true);
        setError('');
        try {
            const data = await fetchConciliacionesCierresProximos(token, { year: ym.year, month: ym.month });
            setPayload(data);
        } catch (e) {
            setError(e.message || 'No se pudo cargar el dashboard de cierres');
            setPayload(null);
        } finally {
            setLoading(false);
        }
    }, [token, ym.year, ym.month]);

    useEffect(() => {
        load();
    }, [load]);

    const cierres = payload?.cierres || [];
    const hoyLabel = formatHoyEs(payload?.hoy);

    const slaTierCounts = useMemo(() => aggregateSlaTierCounts(cierres), [cierres]);

    const pendientesNombres = useMemo(() => {
        return cierres
            .filter((c) => c.configured && c.slaAlert)
            .map((c) => c.cliente)
            .slice(0, 8);
    }, [cierres]);

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filterSoloSinConfig) n += 1;
        if (filterSoloSlaAlert) n += 1;
        if (pageSize !== 20) n += 1;
        return n;
    }, [filterSoloSinConfig, filterSoloSlaAlert, pageSize]);

    const filteredCierres = useMemo(() => {
        const q = foldCliente(search);
        return cierres.filter((c) => {
            const state = cierreVisualState(c);
            if (filterSlaTier && state !== filterSlaTier) return false;
            if (filterSoloSinConfig && state !== 'sinConfig') return false;
            if (filterSoloSlaAlert && !c.slaAlert) return false;
            if (q && !foldCliente(c.cliente).includes(q)) return false;
            return true;
        });
    }, [cierres, search, filterSlaTier, filterSoloSinConfig, filterSoloSlaAlert]);

    const handleVerConciliacion = useCallback(
        (cierre) => {
            if (!cierre?.cliente) return;
            const q = new URLSearchParams({
                cliente: cierre.cliente,
                year: String(ym.year),
                month: String(ym.month)
            });
            navigate(`/admin/conciliaciones/facturacion?${q}`);
        },
        [navigate, ym.year, ym.month]
    );

    const handleTierClick = useCallback((key) => {
        setFilterSlaTier((cur) => (cur === key ? '' : key));
    }, []);

    const emptyText = cierres.length
        ? 'Ningún cliente coincide con los filtros.'
        : 'No hay clientes en el alcance.';

    return (
        <div className={CONCILIACIONES_PAGE_MAIN}>
            <ConciliacionesPageHeader
                isLight={isLight}
                title="Próximos cierres"
                description="Panel operativo por fecha de corte y avance de conciliación"
                icon={CalendarClock}
            >
                <input
                    type="month"
                    className={`${field} max-w-[11rem]`}
                    value={monthValue}
                    onChange={(e) => setMonthValue(e.target.value)}
                    {...nativeCalendarOnlyInputProps}
                    aria-label="Mes de referencia del ciclo"
                />
            </ConciliacionesPageHeader>

            {error ? <div className={conciliacionesErrorBannerClass(isLight)}>{error}</div> : null}

            {hoyLabel ? (
                <div
                    className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
                        isLight ? 'border-cyan-200 bg-cyan-50/80 text-slate-800' : 'border-cyan-500/25 bg-cyan-950/30 text-cyan-50'
                    }`}
                >
                    <p className="font-semibold">Hoy es {hoyLabel}.</p>
                    {pendientesNombres.length ? (
                        <p className="mt-1 text-xs opacity-90">
                            Tienes cierres que requieren atención para: {pendientesNombres.join(', ')}
                            {pendientesNombres.length < cierres.filter((c) => c.slaAlert).length ? '…' : ''}
                        </p>
                    ) : (
                        <p className="mt-1 text-xs opacity-80">No hay alertas SLA activas en este mes.</p>
                    )}
                </div>
            ) : null}

            <ConciliacionesSlaTierResumen
                counts={slaTierCounts}
                activeTier={filterSlaTier}
                onTierClick={handleTierClick}
                isLight={isLight}
                loading={loading}
            />

            {!loading ? (
                <>
                    <ModuleFiltersToolbar
                        chipLabel={
                            activeFilterCount > 0
                                ? `${activeFilterCount} filtro${activeFilterCount !== 1 ? 's' : ''} activo${activeFilterCount !== 1 ? 's' : ''}`
                                : 'Sin filtros'
                        }
                        filtersPanelOpen={drawerOpen}
                        onToggleFilters={() => setDrawerOpen((o) => !o)}
                        toggleId="conciliaciones-cierres-filtros-toggle"
                        panelId="conciliaciones-cierres-filtros-panel"
                        dash={dash}
                    >
                        <div className={`relative min-w-[200px] flex-1 ${GESTION_SEARCH_FIELD_WIDTH}`}>
                            <Search
                                className={`pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${
                                    isLight ? 'text-slate-400' : 'text-slate-500'
                                }`}
                                aria-hidden
                            />
                            <input
                                type="search"
                                className={`${field} w-full pl-9`}
                                placeholder="Buscar clientes"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                aria-label="Buscar clientes"
                            />
                        </div>
                    </ModuleFiltersToolbar>

                    <ModuleFiltersDrawer
                        open={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                        panelId="conciliaciones-cierres-filtros-panel"
                        dash={dash}
                        isLight={isLight}
                    >
                        <div className="flex flex-col gap-1.5">
                            <label className={dash.filtrosDrawerLabel}>Opciones</label>
                            <label
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                                    isLight
                                        ? 'border-slate-200 bg-slate-50 text-slate-800'
                                        : 'border-slate-700/60 bg-slate-800/40 text-slate-200'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={filterSoloSinConfig}
                                    onChange={(e) => setFilterSoloSinConfig(e.target.checked)}
                                    className="h-4 w-4 cursor-pointer rounded accent-[#2F7BB8]"
                                />
                                <div>
                                    <p className="font-semibold">Solo sin configurar</p>
                                    <p className={`mt-0.5 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                        Clientes sin corte/regla en Directorio
                                    </p>
                                </div>
                            </label>
                            <label
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                                    isLight
                                        ? 'border-slate-200 bg-slate-50 text-slate-800'
                                        : 'border-slate-700/60 bg-slate-800/40 text-slate-200'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={filterSoloSlaAlert}
                                    onChange={(e) => setFilterSoloSlaAlert(e.target.checked)}
                                    className="h-4 w-4 cursor-pointer rounded accent-[#2F7BB8]"
                                />
                                <div>
                                    <p className="font-semibold">Solo con alerta SLA</p>
                                    <p className={`mt-0.5 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                        Tier crítico con consultores pendientes
                                    </p>
                                </div>
                            </label>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={dash.filtrosDrawerLabel}>Filas por página</label>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className={`${field} w-full cursor-pointer px-3 py-2.5 text-sm`}
                            >
                                <option value={10}>10 filas</option>
                                <option value={20}>20 filas</option>
                                <option value={50}>50 filas</option>
                            </select>
                        </div>
                    </ModuleFiltersDrawer>
                </>
            ) : null}

            {loading ? (
                <p className={labelMuted}>Cargando cierres…</p>
            ) : (
                <ConciliacionesCierresTable
                    rows={filteredCierres}
                    isLight={isLight}
                    pageSize={pageSize}
                    onVerConciliacion={handleVerConciliacion}
                    emptyText={emptyText}
                />
            )}
        </div>
    );
}
