import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { getTrazabilidadStageKey, TRAZABILIDAD_STAGE_ORDER } from '../hooks/useMonitorData';
import { RECHARTS_TOOLTIP_PANEL_STYLE } from '../constants/rechartsTheme.js';

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

function buildHeatmap(metrics) {
    const total = Math.max(metrics.total || 1, 1);
    const delayFactor = metrics.avgWaitTime === 'N/A' ? 0.35 : 0.65;
    return [
        { actor: 'RRHH', inicio: 0.28, revision: 0.4, firma: 0.2 },
        { actor: 'Legal', inicio: 0.15, revision: 0.75 * delayFactor, firma: 0.32 },
        { actor: 'Candidato', inicio: 0.22, revision: 0.48, firma: Math.min(0.9, (metrics.active / total) + 0.2) },
    ];
}

function heatColor(value) {
    if (value >= 0.65) return 'bg-orange-500/30 border-orange-400/40 text-orange-200';
    if (value >= 0.45) return 'bg-amber-500/25 border-amber-400/35 text-amber-200';
    return 'bg-emerald-500/20 border-emerald-400/35 text-emerald-200';
}

export default function MetricsDashboard({ metrics, loading, executions = [] }) {
    const stageCounts = useMemo(() => buildStageCounts(executions), [executions]);
    const heatmap = useMemo(() => buildHeatmap(metrics), [metrics]);
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
        contactado: '#08bdc6',
        'whatsapp enviado': '#1fc76a',
        'documentos recibidos': '#6d819b',
        'sagrilaft enviado': '#494294',
        finalizado: '#4F8831',
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

        return (
            <div
                className="rounded-xl border"
                style={RECHARTS_TOOLTIP_PANEL_STYLE}
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
            <div className="flex flex-col items-center justify-center py-32">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-zinc-800" />
                    <div className="absolute left-0 top-0 h-16 w-16 animate-spin rounded-full border-2 border-cinte-purple border-t-transparent" />
                </div>
                <p className="mt-6 text-sm uppercase tracking-widest text-[rgba(159,179,200,0.95)]">Cargando métricas...</p>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricTile title="Tiempo Prom. IA" value={metrics.averageTime} subtitle="Pipeline automatico" />
                <MetricTile title="Espera de Firma" value={metrics.avgWaitTime} subtitle="Friccion del candidato" />
                <MetricTile title="Ahorro Estimado" value={metrics.costSaved} subtitle={metrics.costSavedSubtext || 'Costo evitado'} />
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
                <article className="surface-panel p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Conteo por Etapa (sin cargando)</h3>
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
                        style={{
                            borderColor: (stageColors[selected?.stageKey] || '#08bdc6') + '55',
                            background: 'rgba(15,36,55,0.2)',
                        }}
                    >
                        <p className="text-[11px] uppercase tracking-wider text-[rgba(159,179,200,0.95)]">
                            Etapa seleccionada
                        </p>
                        <p className="mt-1 text-lg font-semibold" style={{ color: stageColors[selected?.stageKey] || '#08bdc6' }}>
                            {selected?.label || '—'}
                        </p>
                        <p className="mt-1 text-sm text-[rgba(231,238,247,0.95)]">{selected?.count ?? 0} activos</p>
                        <p className="mt-2 text-xs leading-relaxed text-[rgba(159,179,200,0.95)]">
                            {stageDescriptions[selected?.stageKey] || ''}
                        </p>
                    </div>
                </article>

                <article className="surface-panel p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Heatmap de Friccion</h3>
                    <div className="space-y-2">
                        {heatmap.map((row) => (
                            <div key={row.actor} className="grid grid-cols-4 gap-2 text-xs">
                                <div className="surface-soft px-3 py-2 font-semibold text-[rgba(159,179,200,0.95)]">
                                    {row.actor}
                                </div>
                                <HeatCell value={row.inicio} label="Inicio" />
                                <HeatCell value={row.revision} label="Revision" />
                                <HeatCell value={row.firma} label="Firma" />
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 text-xs text-[rgba(159,179,200,0.95)]">
                        Valores altos representan mayor friccion operativa y probabilidad de estancamiento.
                    </p>
                </article>
            </section>
        </motion.div>
    );
}

function MetricTile({ title, value, subtitle }) {
    return (
        <div className="surface-panel p-4">
            <p className="text-[11px] uppercase tracking-wider text-[rgba(159,179,200,0.95)]">{title}</p>
            <p className="kpi-value mt-1 text-2xl">{value || 'N/A'}</p>
            <p className="mt-1 text-xs text-[rgba(159,179,200,0.95)]">{subtitle}</p>
        </div>
    );
}

function HeatCell({ value, label }) {
    return (
        <div className={`rounded-lg border px-3 py-2 ${heatColor(value)}`}>
            <p className="text-[10px] uppercase tracking-wide">{label}</p>
            <p className="text-sm font-semibold">{Math.round(value * 100)}%</p>
        </div>
    );
}
