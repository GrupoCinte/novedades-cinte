import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from '../../../contratacion/constants/rechartsTheme.js';
import { CINTE_HEADING } from '../../conciliacionesLayout.js';
import { liderClienteChartColor } from '../../facturacionAggregate.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function StackedTooltip({ active, payload, isLight }) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    const panel = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
    return (
        <div style={panel} className="text-xs">
            <p className="mb-2 font-semibold">{row.cliente}</p>
            {payload.map((p) => (
                <p key={p.dataKey} className="tabular-nums">
                    {p.name}: {formatCop(p.value)}
                </p>
            ))}
            <p className="mt-1 tabular-nums font-semibold">Total: {formatCop(row.total)}</p>
        </div>
    );
}

export default function ConciliacionesDashboardLiderClienteStacked({
    data,
    seriesKeys = [],
    dash,
    isLight,
    labelMuted
}) {
    if (!data?.length || !seriesKeys.length) {
        return (
            <div className={`${dash.card} p-4 sm:p-5`}>
                <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>
                    Factura neta por cliente y líder
                </h2>
                <p className={`py-8 text-center text-sm ${labelMuted}`}>Sin datos</p>
            </div>
        );
    }

    const gridColor = isLight ? '#e2e8f0' : '#1a3a56';
    const axisColor = isLight ? '#475569' : '#94a3b8';

    return (
        <div className={`${dash.card} p-4 sm:p-5`}>
            <h2 className={`mb-4 font-heading text-sm font-bold ${CINTE_HEADING}`}>
                Factura neta por cliente y líder
            </h2>
            <div className="h-[min(360px,50vh)] w-full min-h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis
                            dataKey="clienteShort"
                            tick={{ fill: axisColor, fontSize: 10 }}
                            interval={0}
                            angle={-25}
                            textAnchor="end"
                            height={70}
                        />
                        <YAxis
                            tick={{ fill: axisColor, fontSize: 10 }}
                            tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`}
                        />
                        <Tooltip content={<StackedTooltip isLight={isLight} />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {seriesKeys.map((key, i) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                name={key}
                                stackId="lider"
                                fill={liderClienteChartColor(i)}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
