import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import ClienteMesSelectors from './components/ClienteMesSelectors.jsx';
import ConciliacionesDashboardAlertas from './components/dashboard/ConciliacionesDashboardAlertas.jsx';
import ConciliacionesDashboardCierreHeatmap from './components/dashboard/ConciliacionesDashboardCierreHeatmap.jsx';
import ConciliacionesDashboardGapCierre from './components/dashboard/ConciliacionesDashboardGapCierre.jsx';
import ConciliacionesDashboardPareto from './components/dashboard/ConciliacionesDashboardPareto.jsx';
import ConciliacionesDashboardSaludCola from './components/dashboard/ConciliacionesDashboardSaludCola.jsx';
import ConciliacionesDashboardTarifaStacked from './components/dashboard/ConciliacionesDashboardTarifaStacked.jsx';
import ConciliacionesDashboardLiderClienteStacked from './components/dashboard/ConciliacionesDashboardLiderClienteStacked.jsx';
import {
    CONCILIACIONES_PAGE_MAIN,
    conciliacionesErrorBannerClass,
    CINTE_HEADING
} from './conciliacionesLayout.js';
import {
    aggregateDashboardFromColaItems,
    buildClienteCierreHeatmapData,
    buildClienteStackedChartData,
    buildColaSaludChartData,
    buildDashboardAlertas,
    buildGapCierreChartData,
    buildLiderClienteStackedChartData,
    buildParetoIngresosChartData,
    buildSeguimientoEstadoResumen,
    liderClienteChartSeriesKeys
} from './facturacionAggregate.js';
import ConciliacionesDashboardSeguimientoChips from './components/dashboard/ConciliacionesDashboardSeguimientoChips.jsx';
import { fetchColaCierres, fetchDashboardLiderCliente } from './conciliacionesApi.js';
import { formatCopCached } from './facturacionLogic.js';

function formatCop(n) {
    return formatCopCached(n);
}

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

function shortCliente(label) {
    const s = String(label || '').trim();
    if (s.length <= 14) return s;
    return `${s.slice(0, 12)}…`;
}

export default function ConciliacionesDashboardPage({ token }) {
    const navigate = useNavigate();
    const mt = useModuleTheme();
    const { isLight, labelMuted, field } = mt;

    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [loading, setLoading] = useState(true);
    const [liderLoading, setLiderLoading] = useState(true);
    const [error, setError] = useState('');
    const [payload, setPayload] = useState(null);
    const [colaItems, setColaItems] = useState([]);
    const [liderRows, setLiderRows] = useState([]);
    const monthCacheRef = useRef(new Map());

    const ym = useMemo(() => parseMonthValue(monthValue), [monthValue]);

    const openFacturacion = useCallback(
        (arg) => {
            const opts = typeof arg === 'string' ? { cliente: arg } : arg && typeof arg === 'object' ? arg : {};
            const params = new URLSearchParams();
            if (opts.cliente) params.set('cliente', String(opts.cliente).trim());
            if (opts.estadoServicio) params.set('estadoServicio', String(opts.estadoServicio).trim().toUpperCase());
            if (opts.seguimiento) params.set('seguimiento', String(opts.seguimiento).trim().toUpperCase());
            if (ym.year && ym.month) {
                params.set('mes', `${ym.year}-${String(ym.month).padStart(2, '0')}`);
            }
            const qs = params.toString();
            navigate(qs ? `/admin/conciliaciones/facturacion?${qs}` : '/admin/conciliaciones/facturacion');
        },
        [navigate, ym.year, ym.month]
    );

    const load = useCallback(async (options = {}) => {
        const { force = false } = options;
        if (!ym.year || !ym.month) return;
        const cacheKey = `${ym.year}-${ym.month}`;
        if (!force && monthCacheRef.current.has(cacheKey)) {
            const cached = monthCacheRef.current.get(cacheKey);
            setColaItems(cached.colaItems);
            setPayload(cached.payload);
            setLiderRows(cached.liderRows);
            setLoading(false);
            setLiderLoading(false);
            setError('');
            return;
        }
        setLoading(true);
        setLiderLoading(true);
        setError('');
        try {
            const [colaResult, liderResult] = await Promise.allSettled([
                fetchColaCierres(token, { year: ym.year, month: ym.month }),
                fetchDashboardLiderCliente(token, { year: ym.year, month: ym.month })
            ]);

            if (colaResult.status === 'fulfilled') {
                const items = Array.isArray(colaResult.value?.items) ? colaResult.value.items : [];
                setColaItems(items);
                setPayload(aggregateDashboardFromColaItems(items));
            } else {
                throw colaResult.reason;
            }

            if (liderResult.status === 'fulfilled') {
                setLiderRows(Array.isArray(liderResult.value?.items) ? liderResult.value.items : []);
            } else {
                setLiderRows([]);
            }

            monthCacheRef.current.set(cacheKey, {
                colaItems:
                    colaResult.status === 'fulfilled'
                        ? Array.isArray(colaResult.value?.items)
                            ? colaResult.value.items
                            : []
                        : [],
                payload:
                    colaResult.status === 'fulfilled'
                        ? aggregateDashboardFromColaItems(
                              Array.isArray(colaResult.value?.items) ? colaResult.value.items : []
                          )
                        : null,
                liderRows:
                    liderResult.status === 'fulfilled'
                        ? Array.isArray(liderResult.value?.items)
                            ? liderResult.value.items
                            : []
                        : []
            });
        } catch (e) {
            setError(e.message || 'No se pudo cargar el dashboard');
            setPayload(null);
            setColaItems([]);
            setLiderRows([]);
        } finally {
            setLoading(false);
            setLiderLoading(false);
        }
    }, [token, ym.year, ym.month]);

    useEffect(() => {
        load();
    }, [load]);

    const monthCtx = useMemo(() => ({ year: ym.year, month: ym.month }), [ym.year, ym.month]);

    const saludData = useMemo(() => buildColaSaludChartData(colaItems), [colaItems]);

    const seguimientoResumen = useMemo(() => buildSeguimientoEstadoResumen(colaItems), [colaItems]);

    const stackedData = useMemo(
        () => buildClienteStackedChartData(payload?.rows || [], 12, shortCliente),
        [payload?.rows]
    );

    const alertas = useMemo(
        () => buildDashboardAlertas(colaItems, monthCtx),
        [colaItems, monthCtx]
    );

    const gapCierre = useMemo(
        () => buildGapCierreChartData(colaItems, monthCtx),
        [colaItems, monthCtx]
    );

    const paretoData = useMemo(
        () => buildParetoIngresosChartData(payload?.rows || [], 12, shortCliente),
        [payload?.rows]
    );

    const heatmap = useMemo(
        () => buildClienteCierreHeatmapData(colaItems, { maxClientes: 10 }, shortCliente),
        [colaItems]
    );

    const liderChartData = useMemo(
        () => buildLiderClienteStackedChartData(liderRows, 10, shortCliente),
        [liderRows]
    );
    const liderSeriesKeys = useMemo(() => liderClienteChartSeriesKeys(liderChartData), [liderChartData]);

    const gt = payload?.globalTotales;
    const hasServicios = (payload?.serviciosCount ?? 0) > 0;

    return (
        <div className={CONCILIACIONES_PAGE_MAIN}>
            <ClienteMesSelectors
                variant="gestion"
                clientes={[]}
                clienteValue=""
                onClienteChange={() => {}}
                monthValue={monthValue}
                onMonthChange={setMonthValue}
                field={field}
                labelMuted={labelMuted}
                hideClienteSelector
                showMonthInline
                allowTodos={false}
            />

            {error ? (
                <div className={conciliacionesErrorBannerClass(isLight)}>{error}</div>
            ) : null}

            {loading ? <p className={`text-sm ${labelMuted}`}>Cargando indicadores…</p> : null}

            {!loading && !error && !hasServicios ? (
                <p className={`rounded-xl border px-4 py-3 text-sm ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-700 bg-[#1e293b] text-slate-300'}`}>
                    No hay servicios en la cola para el mes seleccionado. Crea servicios y asocia consultores en el módulo Servicios.
                </p>
            ) : null}

            {!loading && hasServicios && gt ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Servicios activos', value: String(payload?.serviciosCount ?? 0) },
                        { label: 'Clientes con servicios', value: String(payload?.clientesCount ?? 0) },
                        { label: 'Suma tarifas', value: formatCop(gt.tarifaSum) },
                        { label: 'Total facturación neta', value: formatCop(gt.facturaSum) }
                    ].map(({ label, value }) => (
                        <div key={label} className={`${dash.card} p-4`}>
                            <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>{label}</p>
                            <p className={`mt-2 font-heading text-lg font-extrabold sm:text-xl ${CINTE_HEADING}`}>{value}</p>
                        </div>
                    ))}
                </div>
            ) : null}

            {!loading && hasServicios ? (
                <ConciliacionesDashboardSeguimientoChips
                    resumen={seguimientoResumen}
                    dash={dash}
                    labelMuted={labelMuted}
                    isLight={isLight}
                    onFilterServicio={openFacturacion}
                />
            ) : null}

            {!loading && hasServicios ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ConciliacionesDashboardSaludCola
                        data={saludData}
                        dash={dash}
                        isLight={isLight}
                        labelMuted={labelMuted}
                        onOpenFacturacion={() => openFacturacion()}
                    />
                    <ConciliacionesDashboardAlertas
                        alertas={alertas}
                        dash={dash}
                        isLight={isLight}
                        labelMuted={labelMuted}
                        onOpenCliente={openFacturacion}
                    />
                </div>
            ) : null}

            {!loading && hasServicios ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ConciliacionesDashboardGapCierre
                        gap={gapCierre}
                        dash={dash}
                        isLight={isLight}
                        labelMuted={labelMuted}
                    />
                    <ConciliacionesDashboardPareto
                        data={paretoData}
                        dash={dash}
                        isLight={isLight}
                        labelMuted={labelMuted}
                        onOpenCliente={openFacturacion}
                    />
                </div>
            ) : null}

            {!loading && hasServicios ? (
                <ConciliacionesDashboardTarifaStacked
                    data={stackedData}
                    dash={dash}
                    isLight={isLight}
                    labelMuted={labelMuted}
                />
            ) : null}

            {!loading && hasServicios && liderLoading ? (
                <p className={`text-sm ${labelMuted}`}>Cargando gráfico por líder…</p>
            ) : null}

            {!loading && hasServicios && !liderLoading && liderChartData.length ? (
                <ConciliacionesDashboardLiderClienteStacked
                    data={liderChartData}
                    seriesKeys={liderSeriesKeys}
                    dash={dash}
                    isLight={isLight}
                    labelMuted={labelMuted}
                />
            ) : null}

            {!loading && hasServicios ? (
                <ConciliacionesDashboardCierreHeatmap
                    heatmap={heatmap}
                    dash={dash}
                    isLight={isLight}
                    labelMuted={labelMuted}
                    onOpenCliente={openFacturacion}
                />
            ) : null}

            {!loading && payload?.rows?.length ? (
                <div className={`${dash.card} overflow-hidden`}>
                    <h2 className={`border-b px-4 py-3 font-heading text-sm font-bold ${dash.titleLg} ${dash.gestionHead} ${CINTE_HEADING}`}>Detalle por cliente</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className={dash.thead}>
                                <tr>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Cliente</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Tarifas</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Deducción</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Factura</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {payload.rows.map((r) => (
                                    <tr key={r.cliente} className={dash.trHover}>
                                        <td className={dash.tdName}>{r.cliente}</td>
                                        <td className={`${dash.tdCell} tabular-nums`}>{formatCop(r.totales?.tarifaSum)}</td>
                                        <td className={`${dash.tdCell} tabular-nums`}>{formatCop(r.totales?.deduccionSum)}</td>
                                        <td className={`${dash.tdCell} tabular-nums font-semibold ${CINTE_HEADING}`}>{formatCop(r.totales?.facturaSum)}</td>
                                        <td className={`${dash.tdCell} text-right`}>
                                            <button
                                                type="button"
                                                className={dash.actionBtn}
                                                onClick={() => openFacturacion(r.cliente)}
                                            >
                                                Facturación
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
