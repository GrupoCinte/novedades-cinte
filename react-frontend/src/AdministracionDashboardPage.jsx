import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { AlertTriangle, Building2, LayoutDashboard, Users } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from './contratacion/constants/rechartsTheme.js';
import {
    aggregateReubicacionesPorMesFechaFin,
    aggregateSemaforoReubicaciones,
    aggregateTipoContrato,
    countConsultoresByActivo,
    countReubicacionesEnRiesgo,
    monthCalendarRangeFromYm,
    SEMAFORO_CHART_COLOR,
    topCatalogClientesByActiveCount,
    topClientesPorConsultores
} from './administracionDashboardAggregate.js';
import {
    fetchAllClientesResumen,
    fetchAllColaboradores,
    fetchAllReubicacionesPipeline
} from './administracionDashboardApi.js';

/** Recharts Bar `onClick` puede exponer el payload en formas distintas según versión. */
function barEventPayload(ev) {
    return ev?.payload ?? ev?.activePayload?.[0]?.payload;
}

/** Etiquetas largas en eje categoría: tooltip nativo + truncado suave. */
function formatAxisCategoryLabel(v, maxLen = 34) {
    const s = String(v ?? '');
    if (s.length <= maxLen) return s;
    return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function ChartCard({ title, subtitle, children, isLight, className = '', chartClassName = '' }) {
    const card = isLight
        ? 'rounded-2xl border border-slate-200 bg-white p-4 shadow-md'
        : 'rounded-2xl border border-slate-700/50 bg-[#1e293b] p-4 shadow-lg';
    const t = isLight ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-white';
    const s = isLight ? 'text-xs text-slate-500 mt-0.5' : 'text-xs text-slate-400 mt-0.5';
    return (
        <div className={`${card} flex flex-col min-h-[360px] ${className}`}>
            <div className="mb-2 shrink-0">
                <h3 className={t}>{title}</h3>
                {subtitle ? <p className={s}>{subtitle}</p> : null}
            </div>
            <div className={`flex-1 min-h-[260px] w-full ${chartClassName}`}>{children}</div>
        </div>
    );
}

function KpiCard({ label, value, hint, isLight, icon: Icon, onNavigate }) {
    const card = isLight
        ? 'rounded-2xl border border-slate-200 bg-white p-4 shadow-md'
        : 'rounded-2xl border border-slate-700/50 bg-[#1e293b] p-4 shadow-lg';
    const titleC = isLight ? 'text-xs font-semibold uppercase tracking-wider text-slate-500' : 'text-xs font-semibold uppercase tracking-wider text-slate-400';
    const valC = isLight ? 'text-2xl font-bold text-slate-900 tabular-nums' : 'text-2xl font-bold text-white tabular-nums';
    const hintC = isLight ? 'text-xs text-slate-600 mt-1' : 'text-xs text-slate-400 mt-1';
    const interactive = typeof onNavigate === 'function';
    const inner = (
        <>
            <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50 text-[#2F7BB8]' : 'border-slate-600 bg-slate-800/80 text-sky-400'
                }`}
            >
                <Icon size={20} aria-hidden />
            </div>
            <div className="min-w-0">
                <p className={titleC}>{label}</p>
                <p className={valC}>{value}</p>
                {hint ? <p className={hintC}>{hint}</p> : null}
                {interactive ? (
                    <p className={`${hintC} mt-1 font-medium text-[#2F7BB8] ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
                        Clic para abrir módulo →
                    </p>
                ) : null}
            </div>
        </>
    );
    if (interactive) {
        return (
            <button
                type="button"
                onClick={onNavigate}
                className={`${card} flex gap-3 items-start text-left w-full transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7BB8]/60 rounded-2xl`}
            >
                {inner}
            </button>
        );
    }
    return <div className={`${card} flex gap-3 items-start`}>{inner}</div>;
}

function SemaforoTooltip({ active, payload, isLight }) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    const name = row?.name ?? '';
    const v = row?.value;
    const key = row?.key;
    const color = key ? SEMAFORO_CHART_COLOR[key] : '#64748b';
    const style = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
    return (
        <div style={style}>
            <p className="text-xs font-bold uppercase tracking-wide m-0">{name}</p>
            <p className="text-sm font-semibold m-1 mt-1" style={{ color }}>
                {v} reubicaciones
            </p>
            <p className={`text-[10px] m-0 mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Clic en el sector para filtrar</p>
        </div>
    );
}

/**
 * @param {{ token?: string, onDrillDown?: (action: { type: string } & Record<string, unknown>) => void }} props
 */
export default function AdministracionDashboardPage({ token, onDrillDown }) {
    const { isLight, labelMuted, headingAccent } = useModuleTheme();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [clientesRows, setClientesRows] = useState([]);
    const [colabRows, setColabRows] = useState([]);
    const [reubRows, setReubRows] = useState([]);

    const drill = useCallback(
        (action) => {
            if (typeof onDrillDown === 'function') onDrillDown(action);
        },
        [onDrillDown]
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [cr, co, ru] = await Promise.all([
                fetchAllClientesResumen(token, 'true'),
                fetchAllColaboradores(token, 'all'),
                fetchAllReubicacionesPipeline(token)
            ]);
            setClientesRows(cr);
            setColabRows(co);
            setReubRows(ru);
        } catch (e) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        load();
    }, [load]);

    const semaforoSeries = useMemo(() => aggregateSemaforoReubicaciones(reubRows), [reubRows]);
    const semaforoPieData = useMemo(() => semaforoSeries.filter((d) => d.value > 0), [semaforoSeries]);

    const tipoContratoData = useMemo(() => aggregateTipoContrato(colabRows), [colabRows]);
    const topClientesConsultores = useMemo(() => topClientesPorConsultores(colabRows, 12), [colabRows]);
    const mesFinData = useMemo(() => aggregateReubicacionesPorMesFechaFin(reubRows), [reubRows]);
    const topActivosCatalogo = useMemo(() => topCatalogClientesByActiveCount(clientesRows, 12), [clientesRows]);

    const { activos: coActivos, inactivos: coInactivos } = useMemo(() => countConsultoresByActivo(colabRows), [colabRows]);
    const riesgoCount = useMemo(() => countReubicacionesEnRiesgo(reubRows), [reubRows]);

    const tooltipStyle = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
    const gridColor = isLight ? '#e2e8f0' : '#334155';
    const axisColor = isLight ? '#64748b' : '#94a3b8';
    /** Valores sobre/imagen de cada barra (legibilidad claro/oscuro). */
    const labelListFill = isLight ? '#334155' : '#e2e8f0';

    const barCursor = { fill: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(248, 250, 252, 0.06)' };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 font-body">
                <div className="relative">
                    <div className="h-14 w-14 rounded-full border-2 border-slate-600" />
                    <div className="absolute left-0 top-0 h-14 w-14 animate-spin rounded-full border-2 border-[#2F7BB8] border-t-transparent" />
                </div>
                <p className={`mt-4 text-sm ${labelMuted}`}>Cargando métricas del directorio…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                    isLight ? 'border-red-200 bg-red-50 text-red-900' : 'border-red-800/50 bg-red-950/40 text-red-200'
                }`}
            >
                <span className="font-semibold">No se pudieron cargar los datos.</span> {error}
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full max-w-[95rem] font-body">
            <p className={`text-xs ${labelMuted}`}>
                Resumen de <strong className={headingAccent}>clientes en catálogo (activos)</strong>, consultores en
                directorio y reubicaciones en pipeline.{' '}
                <span className="font-medium text-slate-500 dark:text-slate-400">
                    Clic en KPIs, barras o sectores para abrir el módulo con el filtro aplicado.
                </span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    isLight={isLight}
                    icon={Building2}
                    label="Clientes en catálogo"
                    value={clientesRows.length}
                    hint="Fila por cliente (filtro activos, coherente con la tabla Cliente)."
                    onNavigate={() => drill({ type: 'cliente', q: '' })}
                />
                <KpiCard
                    isLight={isLight}
                    icon={Users}
                    label="Consultores / staff"
                    value={colabRows.length}
                    hint={`${coActivos} activos · ${coInactivos} inactivos`}
                    onNavigate={() => drill({ type: 'consultoresPorCliente', q: '' })}
                />
                <KpiCard
                    isLight={isLight}
                    icon={LayoutDashboard}
                    label="Reubicaciones (pipeline)"
                    value={reubRows.length}
                    hint="Seguimiento con fecha fin y causal."
                    onNavigate={() => drill({ type: 'reubicacionesSinFiltro' })}
                />
                <KpiCard
                    isLight={isLight}
                    icon={AlertTriangle}
                    label="Reubicaciones en riesgo"
                    value={riesgoCount}
                    hint="En riesgo + urgente + vencido (semáforo)."
                    onNavigate={() =>
                        drill({
                            type: 'reubicaciones',
                            fechaFinDesde: '',
                            fechaFinHasta: '',
                            semaforo: 'Amarillo,Rojo,Vencido'
                        })
                    }
                />
            </div>

            {/* Fila 1: semáforo + tipo contrato */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                    isLight={isLight}
                    title="Reubicaciones por semáforo"
                    subtitle="Clic en un sector → Reubicaciones filtradas por semáforo."
                    chartClassName="cursor-pointer"
                >
                    {semaforoPieData.length === 0 ? (
                        <p className={`text-sm ${labelMuted} py-8 text-center`}>Sin datos en pipeline.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={semaforoPieData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={56}
                                    outerRadius={88}
                                    paddingAngle={2}
                                    cursor="pointer"
                                    onClick={(sliceProps) => {
                                        const row = sliceProps?.payload ?? semaforoPieData[sliceProps?.index];
                                        if (!row?.key) return;
                                        drill({
                                            type: 'reubicaciones',
                                            fechaFinDesde: '',
                                            fechaFinHasta: '',
                                            semaforo: row.key
                                        });
                                    }}
                                >
                                    {semaforoPieData.map((entry) => (
                                        <Cell key={entry.key} fill={SEMAFORO_CHART_COLOR[entry.key] || '#64748b'} />
                                    ))}
                                </Pie>
                                <Tooltip content={<SemaforoTooltip isLight={isLight} />} />
                                <Legend
                                    formatter={(value) => (
                                        <span className={isLight ? 'text-slate-700 text-xs' : 'text-slate-200 text-xs'}>
                                            {value}
                                        </span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard
                    isLight={isLight}
                    title="Consultores por tipo de contrato"
                    subtitle='Clic en una barra → Consultores filtrados por tipo (vacíos = «Sin clasificar»).'
                    chartClassName="cursor-pointer"
                >
                    {tipoContratoData.length === 0 ? (
                        <p className={`text-sm ${labelMuted} py-8 text-center`}>Sin colaboradores.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={tipoContratoData}
                                margin={{ top: 12, right: 44, left: 4, bottom: 12 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={156}
                                    interval={0}
                                    tick={{ fill: axisColor, fontSize: 11 }}
                                    tickFormatter={(v) => formatAxisCategoryLabel(v, 22)}
                                />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar
                                    dataKey="value"
                                    name="Consultores"
                                    fill="#2F7BB8"
                                    radius={[0, 4, 4, 0]}
                                    cursor={barCursor}
                                    onClick={(ev) => {
                                        const name = barEventPayload(ev)?.name;
                                        if (name == null) return;
                                        drill({ type: 'consultoresPorTipoContrato', tipoContrato: String(name) });
                                    }}
                                >
                                    <LabelList
                                        dataKey="value"
                                        position="right"
                                        fill={labelListFill}
                                        fontSize={12}
                                        fontWeight={600}
                                        offset={8}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            {/* Fila 2: top consultores por cliente | reubicaciones por mes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                    isLight={isLight}
                    title="Top clientes por número de consultores"
                    subtitle="Clic en una barra → Consultores con búsqueda por ese cliente."
                    chartClassName="cursor-pointer"
                >
                    {topClientesConsultores.length === 0 ? (
                        <p className={`text-sm ${labelMuted} py-8 text-center`}>Sin datos.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={topClientesConsultores}
                                margin={{ top: 12, right: 48, left: 4, bottom: 12 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={214}
                                    interval={0}
                                    tick={{ fill: axisColor, fontSize: 10 }}
                                    tickFormatter={(v) => formatAxisCategoryLabel(v, 36)}
                                />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar
                                    dataKey="value"
                                    name="Consultores"
                                    fill="#2563eb"
                                    radius={[0, 4, 4, 0]}
                                    cursor={barCursor}
                                    onClick={(ev) => {
                                        const name = barEventPayload(ev)?.name;
                                        if (name == null) return;
                                        drill({ type: 'consultoresPorCliente', q: String(name) });
                                    }}
                                >
                                    <LabelList
                                        dataKey="value"
                                        position="right"
                                        fill={labelListFill}
                                        fontSize={12}
                                        fontWeight={600}
                                        offset={8}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard
                    isLight={isLight}
                    title="Reubicaciones por mes de fecha fin"
                    subtitle="Clic en una barra → Reubicaciones con rango de fechas de ese mes."
                    chartClassName="cursor-pointer"
                >
                    {mesFinData.length === 0 ? (
                        <p className={`text-sm ${labelMuted} py-8 text-center`}>Sin fechas fin en pipeline.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={mesFinData}
                                margin={{ top: 28, right: 8, left: 4, bottom: mesFinData.length > 8 ? 72 : 56 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fill: axisColor, fontSize: 10 }}
                                    interval={0}
                                    angle={mesFinData.length > 6 ? -35 : 0}
                                    textAnchor={mesFinData.length > 6 ? 'end' : 'middle'}
                                    height={mesFinData.length > 6 ? 68 : 36}
                                />
                                <YAxis tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar
                                    dataKey="count"
                                    name="Reubicaciones"
                                    fill="#0d9488"
                                    radius={[4, 4, 0, 0]}
                                    cursor={barCursor}
                                    onClick={(ev) => {
                                        const month = barEventPayload(ev)?.month;
                                        if (!month) return;
                                        const { desde, hasta } = monthCalendarRangeFromYm(month);
                                        drill({
                                            type: 'reubicaciones',
                                            fechaFinDesde: desde,
                                            fechaFinHasta: hasta,
                                            semaforo: ''
                                        });
                                    }}
                                >
                                    <LabelList
                                        dataKey="count"
                                        position="top"
                                        fill={labelListFill}
                                        fontSize={12}
                                        fontWeight={600}
                                        offset={6}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            {/* Fila 3: líderes activos — ancho completo */}
            <div className="grid grid-cols-1 gap-6">
                <ChartCard
                    isLight={isLight}
                    title="Clientes: líderes activos (top)"
                    subtitle="Clic en una barra → Cliente con búsqueda por ese nombre en el catálogo."
                    chartClassName="cursor-pointer"
                >
                    {topActivosCatalogo.length === 0 ? (
                        <p className={`text-sm ${labelMuted} py-8 text-center`}>Sin filas en resumen.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={380}>
                            <BarChart
                                layout="vertical"
                                data={topActivosCatalogo}
                                margin={{ top: 12, right: 48, left: 4, bottom: 12 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={228}
                                    interval={0}
                                    tick={{ fill: axisColor, fontSize: 10 }}
                                    tickFormatter={(v) => formatAxisCategoryLabel(v, 38)}
                                />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar
                                    dataKey="value"
                                    name="Líderes activos"
                                    fill="#7c3aed"
                                    radius={[0, 4, 4, 0]}
                                    cursor={barCursor}
                                    onClick={(ev) => {
                                        const name = barEventPayload(ev)?.name;
                                        if (name == null || name === '—') return;
                                        drill({ type: 'cliente', q: String(name) });
                                    }}
                                >
                                    <LabelList
                                        dataKey="value"
                                        position="right"
                                        fill={labelListFill}
                                        fontSize={12}
                                        fontWeight={600}
                                        offset={8}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>
        </div>
    );
}
