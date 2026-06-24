import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from '../../../contratacion/constants/rechartsTheme.js';
import { ALERTA_TIPO_LABELS, ALERTA_TIPO_ORDER } from '../../facturacionAggregate.js';
import { CINTE_HEADING } from '../../conciliacionesLayout.js';

const ALERTA_CHIP = {
    devuelta: 'text-red-500 border-red-500/30 bg-red-500/10',
    cierre_vencido: 'text-orange-500 border-orange-500/30 bg-orange-500/10',
    sin_consultores: 'text-slate-500 border-slate-500/30 bg-slate-500/10',
    bajo_avance: 'text-amber-500 border-amber-500/30 bg-amber-500/10'
};

const ALERTA_BAR_COLOR = {
    devuelta: '#ef4444',
    cierre_vencido: '#f97316',
    sin_consultores: '#64748b',
    bajo_avance: '#f59e0b'
};

export default function ConciliacionesDashboardAlertas({
    alertas,
    dash,
    isLight,
    labelMuted,
    onOpenCliente
}) {
    const counts = alertas?.counts || {};
    const entries = alertas?.entries || [];
    const chartData = alertas?.chartData || [];
    const totalAlertas = ALERTA_TIPO_ORDER.reduce((s, t) => s + (counts[t] || 0), 0);

    const gridColor = isLight ? '#e2e8f0' : '#1a3a56';
    const axisColor = isLight ? '#475569' : '#94a3b8';
    const tooltipStyle = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;

    return (
        <div className={`${dash.card} flex min-h-[320px] flex-col p-4 sm:p-5`}>
            <h2 className={`mb-3 font-heading text-sm font-bold ${CINTE_HEADING}`}>Alertas operativas</h2>

            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ALERTA_TIPO_ORDER.map((tipo) => (
                    <div
                        key={tipo}
                        className={`rounded-lg border px-2 py-2 text-center ${ALERTA_CHIP[tipo]}`}
                    >
                        <p className="text-lg font-bold tabular-nums">{counts[tipo] ?? 0}</p>
                        <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide">
                            {ALERTA_TIPO_LABELS[tipo]}
                        </p>
                    </div>
                ))}
            </div>

            {totalAlertas === 0 ? (
                <p className={`py-6 text-center text-sm ${labelMuted}`}>Sin alertas para este mes</p>
            ) : (
                <>
                    <ul className="mb-4 max-h-[140px] space-y-1 overflow-y-auto text-sm">
                        {entries.map((e, i) => (
                            <li key={`${e.client}-${e.serviceName}-${i}`}>
                                <button
                                    type="button"
                                    className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${
                                        isLight
                                            ? 'border-slate-200 hover:border-[#2F7BB8]/40 hover:bg-slate-50'
                                            : 'border-[#0F2337] hover:border-[#65BCF7]/30 hover:bg-[#0A1F30]/60'
                                    }`}
                                    onClick={() => onOpenCliente?.(e.client)}
                                >
                                    <span className={`mr-2 inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${ALERTA_CHIP[e.tipo]}`}>
                                        {e.label}
                                    </span>
                                    <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                                        {e.client} · {e.serviceName}
                                    </span>
                                    <span className={`ml-1 tabular-nums text-xs ${labelMuted}`}>({e.progress}%)</span>
                                </button>
                            </li>
                        ))}
                    </ul>

                    {chartData.length > 0 ? (
                        <div className="mt-auto h-[100px] w-full min-h-[80px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={chartData}
                                    margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                                >
                                    <XAxis type="number" tick={{ fill: axisColor, fontSize: 10 }} allowDecimals={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="label"
                                        width={88}
                                        tick={{ fill: axisColor, fontSize: 9 }}
                                    />
                                    <Tooltip
                                        formatter={(v) => [v, 'Servicios']}
                                        contentStyle={tooltipStyle}
                                    />
                                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                                        {chartData.map((row) => (
                                            <Cell key={row.tipo} fill={ALERTA_BAR_COLOR[row.tipo] || '#64748b'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
