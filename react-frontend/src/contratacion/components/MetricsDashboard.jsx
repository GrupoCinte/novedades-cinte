import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    PieChart, Pie, Tooltip, ResponsiveContainer, Cell,
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    BarChart, Bar,
} from 'recharts';

import { getTrazabilidadStageKey, TRAZABILIDAD_STAGE_ORDER } from '../hooks/useMonitorData';
import {
    RECHARTS_TOOLTIP_PANEL_STYLE,
    RECHARTS_TOOLTIP_PANEL_STYLE_LIGHT,
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT,
} from '../constants/rechartsTheme.js';
import { useModuleTheme } from '../../moduleTheme.js';

function buildStageCounts(executions = []) {
    const counts = {};

    executions.forEach((ex) => {
        const stageKey = getTrazabilidadStageKey(ex.realStatus, ex.statusId);
        if (!stageKey || stageKey === 'cargando') return;
        counts[stageKey] = (counts[stageKey] || 0) + 1;
    });

    // Mantener orden de pipeline y omitir las etapas con conteo 0.
    const labels = {
        contactado: 'Contactado',
        'whatsapp enviado': 'WhatsApp enviado',
        'documentos recibidos': 'Documentos recibidos',
        'sagrilaft enviado': 'Sagrilaft enviado',
        finalizado: 'Finalizado',
    };

    return TRAZABILIDAD_STAGE_ORDER.filter((k) => k !== 'cargando')
        .map((stageKey) => ({
            stageKey,
            label: labels[stageKey] || stageKey,
            count: counts[stageKey] || 0,
        }))
        .filter((row) => row.count > 0);
}

function normalizeKey(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function resolveDescriptivoCinte(execution) {
    const full = execution.fullData || {};
    const fallback = full?.puesto;
    const keys = Object.keys(full);
    for (const key of keys) {
        const nk = normalizeKey(key);
        if (nk.includes('descript') && nk.includes('cinte')) {
            const raw = full[key];
            const val = typeof raw === 'string' ? raw : raw != null ? String(raw) : '';
            const clean = val.trim();
            if (clean && clean.toLowerCase() !== 'null' && clean.toLowerCase() !== 'undefined') return clean;
        }
    }
    const fb = typeof fallback === 'string' ? fallback : fallback != null ? String(fallback) : '';
    return fb.trim() || 'Sin Descriptivo CINTE';
}

function buildMonthlyGrowth(executions) {
    const bucket = {};
    executions.forEach((ex) => {
        const ts = ex.fullData?.ts_eliminado || ex.fullData?.ts_validacion_completada || ex.timestamp;
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return;
        const monthKey = date.getFullYear() * 100 + (date.getMonth() + 1);
        const monthLabel = date.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
        if (!bucket[monthKey]) bucket[monthKey] = { monthKey, month: monthLabel, firmas: 0 };
        bucket[monthKey].firmas += 1;
    });
    return Object.values(bucket)
        .sort((a, b) => a.monthKey - b.monthKey)
        .map(({ month, firmas }) => ({ month, firmas }));
}

function buildDescriptivoCinteBars(executions, max = 8) {
    const bucket = {};
    executions.forEach((ex) => {
        const label = resolveDescriptivoCinte(ex);
        const key = String(label).trim();
        if (!key) return;
        bucket[key] = (bucket[key] || 0) + 1;
    });
    const sorted = Object.entries(bucket)
        .map(([tipo, firmas]) => ({ tipo, firmas }))
        .sort((a, b) => b.firmas - a.firmas);
    const top = sorted.slice(0, max);
    const rest = sorted.slice(max);
    const others = rest.reduce((sum, r) => sum + r.firmas, 0);
    if (others > 0) top.push({ tipo: 'Otros', firmas: others });
    return top;
}

export default function MetricsDashboard({ metrics, loading, executions = [] }) {
    const { isLight } = useModuleTheme();
    const stageCounts = useMemo(() => buildStageCounts(executions), [executions]);
    const monthlyGrowth = useMemo(() => buildMonthlyGrowth(executions), [executions]);
    const descriptivoCinteBars = useMemo(() => buildDescriptivoCinteBars(executions, 8), [executions]);
    const [selectedStageKey, setSelectedStageKey] = useState(stageCounts[0]?.stageKey || '');

    useEffect(() => {
        if (!stageCounts?.length) {
            setSelectedStageKey('');
            return;
        }
        const exists = stageCounts.some(s => s.stageKey === selectedStageKey);
        if (!exists) setSelectedStageKey(stageCounts[0].stageKey);
    }, [stageCounts, selectedStageKey]);

    const stageColors = {
        contactado: '#ffb347',
        'whatsapp enviado': '#14ffec',
        'documentos recibidos': '#2F7BB8',
        'sagrilaft enviado': '#A259FF',
        finalizado: '#FF3366',
    };

    const stageDescriptions = {
        contactado: 'Candidatos que ya iniciaron contacto en el flujo.',
        'whatsapp enviado': 'Candidatos a los que ya se les envió WhatsApp.',
        'documentos recibidos': 'Candidatos con documentos recibidos y pipeline activo.',
        'sagrilaft enviado': 'Candidatos con envío Sagrilaft completado en el flujo.',
        finalizado: 'Candidatos que ya cerraron el proceso.',
    };

    const selected = stageCounts.find(s => s.stageKey === selectedStageKey) || stageCounts[0];

    function StageTooltip({ active, payload, label }) {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0];
        const stageKey = item?.payload?.stageKey || label;
        const tone = stageColors[stageKey] || '#08bdc6';
        const stageLabel = item?.payload?.label || stageKey;
        const count = item?.value;
        const panelStyle = isLight ? RECHARTS_TOOLTIP_PANEL_STYLE_LIGHT : RECHARTS_TOOLTIP_PANEL_STYLE;

        return (
            <div
                className="rounded-xl border"
                style={panelStyle}
            >
                <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                    {stageLabel}
                </p>
                <p style={{ margin: '6px 0 0', color: tone, fontWeight: 700 }}>
                    {count} activos
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 font-body">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-zinc-800" />
                    <div className="absolute left-0 top-0 h-16 w-16 animate-spin rounded-full border-2 border-cinte-purple border-t-transparent" />
                </div>
                <p className={`mt-6 text-sm uppercase tracking-widest ${isLight ? 'text-slate-600' : 'text-[rgba(159,179,200,0.95)]'}`}>Cargando métricas...</p>
            </div>
        );
    }

    const glassPanel = isLight ? 'overflow-hidden rounded-2xl border backdrop-blur-xl bg-white/80 border-white/40 shadow-xl' : 'glass-card';

    const chartTick = isLight ? '#64748b' : 'rgba(159,179,200,0.95)';
    const chartGrid = isLight ? '#e2e8f0' : 'rgba(109, 129, 155, 0.2)';
    const chartTooltip = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 font-body">
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <MetricTile isLight={isLight} glassPanel={glassPanel} title="Tiempo prom. pipeline" value={metrics.averageTime} subtitle="Pipeline automático" />
                <MetricTile isLight={isLight} glassPanel={glassPanel} title="Espera de Firma" value={metrics.avgWaitTime} subtitle="Friccion del candidato" />
            </section>

            {/* ── Fila 2: Donut etapas + Ingresos mensuales ── */}
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
                <article className={`${glassPanel} p-6`}>
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Conteo por Etapa</h3>
                        <span className="text-[10px] font-bold text-[#ffb347] bg-[#ffb347]/10 px-2 py-1 rounded-full border border-[#ffb347]/20">Pipeline Activo</span>
                    </div>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Tooltip content={(props) => <StageTooltip {...props} />} />
                                <Pie
                                    data={stageCounts}
                                    dataKey="count"
                                    nameKey="label"
                                    innerRadius={65}
                                    outerRadius={95}
                                    paddingAngle={4}
                                    onClick={(data) => {
                                        const stageKey =
                                            data?.stageKey ||
                                            data?.payload?.stageKey ||
                                            data?.name ||
                                            data?.payload?.label;
                                        if (stageKey) setSelectedStageKey(stageKey);
                                    }}
                                >
                                    {stageCounts.map((entry) => (
                                        <Cell
                                            key={entry.stageKey}
                                            fill={stageColors[entry.stageKey] || '#08bdc6'}
                                            cursor="pointer"
                                        />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div
                        className="mt-4 rounded-xl border p-4"
                        style={
                            isLight
                                ? {
                                    borderColor: `${stageColors[selected?.stageKey] || '#08bdc6'}99`,
                                    background: 'rgba(47, 123, 184, 0.08)',
                                }
                                : {
                                    borderColor: `${stageColors[selected?.stageKey] || '#08bdc6'}55`,
                                    background: 'rgba(15,36,55,0.2)',
                                }
                        }
                    >
                        <p className={`text-[11px] uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-[rgba(159,179,200,0.95)]'}`}>
                            Etapa seleccionada
                        </p>
                        <p className="mt-1 text-lg font-semibold" style={{ color: stageColors[selected?.stageKey] || '#08bdc6' }}>
                            {selected?.label || '—'}
                        </p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-800' : 'text-[rgba(231,238,247,0.95)]'}`}>{selected?.count ?? 0} activos</p>
                        <p className={`mt-2 text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-[rgba(159,179,200,0.95)]'}`}>
                            {stageDescriptions[selected?.stageKey] || ''}
                        </p>
                    </div>
                </article>

                <article className={`${glassPanel} p-6`}>
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Ingresos Reales Mensual</h3>
                        <span className="text-[10px] font-bold text-[#14ffec] bg-[#14ffec]/10 px-2 py-1 rounded-full border border-[#14ffec]/20">Métrica Global</span>
                    </div>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyGrowth}>
                                <defs>
                                    <linearGradient id="growthFillM" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#14ffec" stopOpacity={0.5} />
                                        <stop offset="100%" stopColor="#14ffec" stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                                <XAxis dataKey="month" stroke={chartTick} axisLine={false} tickLine={false} />
                                <YAxis stroke={chartTick} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={chartTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Area type="monotone" dataKey="firmas" stroke="#14ffec" fill="url(#growthFillM)" strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </article>
            </section>

            {/* ── Fila 3: Conteo por tipo descriptivo (ancho completo) ── */}
            <section>
                <article className={`${glassPanel} p-6`}>
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Conteo por Tipo Descriptivo</h3>
                        <span className="text-[10px] font-bold text-[#ffb347] bg-[#ffb347]/10 px-2 py-1 rounded-full border border-[#ffb347]/20">Descriptivo CINTE</span>
                    </div>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={descriptivoCinteBars} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                                <XAxis type="number" stroke={chartTick} axisLine={false} tickLine={false} />
                                <YAxis
                                    type="category"
                                    dataKey="tipo"
                                    width={200}
                                    stroke={chartTick}
                                    interval={0}
                                    axisLine={false}
                                    tickLine={false}
                                    ticks={descriptivoCinteBars.map((d) => d.tipo)}
                                    tick={{ fontSize: 11, fill: chartTick }}
                                    tickFormatter={(v) => String(v).length > 24 ? `${String(v).slice(0, 24)}…` : String(v)}
                                />
                                <Tooltip contentStyle={chartTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="firmas" fill="#ffb347" radius={[0, 4, 4, 0]} barSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </article>
            </section>
        </motion.div>
    );
}

function MetricTile({ isLight, glassPanel, title, value, subtitle }) {
    return (
        <div className={`${glassPanel} p-4`}>
            <p className={`text-[11px] uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-[rgba(159,179,200,0.95)]'}`}>{title}</p>
            <p className={`mt-1 text-2xl ${isLight ? 'kpi-value' : 'title-gradient font-bold tracking-tight'}`}>{value || 'N/A'}</p>
            <p className={`mt-1 text-xs ${isLight ? 'text-slate-600' : 'text-[rgba(159,179,200,0.95)]'}`}>{subtitle}</p>
        </div>
    );
}


