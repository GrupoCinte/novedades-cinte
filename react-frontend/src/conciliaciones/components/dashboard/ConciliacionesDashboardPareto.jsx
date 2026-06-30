import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from '../../../contratacion/constants/rechartsTheme.js';
import { CINTE_HEADING, CINTE_PRIMARY } from '../../conciliacionesLayout.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function ParetoTooltip({ active, payload, isLight }) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    const panel = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
    return (
        <div style={panel} className="text-xs">
            <p className="mb-1 font-semibold">{row.cliente}</p>
            <p className="tabular-nums">Factura: {formatCop(row.factura)}</p>
            <p className="tabular-nums">Acumulado: {formatCop(row.cumulativeFactura)} ({row.cumulativePct}%)</p>
        </div>
    );
}

export default function ConciliacionesDashboardPareto({
    data,
    dash,
    isLight,
    labelMuted,
    onOpenCliente
}) {
    if (!data?.length) {
        return (
            <div className={`${dash.card} flex min-h-[280px] flex-col p-4 sm:p-5`}>
                <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Concentración de ingresos (Pareto)</h2>
                <p className={`mt-auto py-8 text-center text-sm ${labelMuted}`}>Sin datos</p>
            </div>
        );
    }

    const gridColor = isLight ? '#e2e8f0' : '#1a3a56';
    const axisColor = isLight ? '#475569' : '#94a3b8';
    const topPct = data[data.length - 1]?.cumulativePct ?? 0;

    return (
        <div className={`${dash.card} flex min-h-[280px] flex-col p-4 sm:p-5`}>
            <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Concentración de ingresos (Pareto)</h2>
            <p className={`mt-1 text-xs ${labelMuted}`}>
                Top {data.length} clientes · el grupo acumula {topPct}% de la facturación neta
            </p>

            <div className="mt-3 h-[min(280px,38vh)] w-full min-h-[200px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis
                            dataKey="clienteShort"
                            tick={{ fill: axisColor, fontSize: 9 }}
                            interval={0}
                            angle={-30}
                            textAnchor="end"
                            height={56}
                        />
                        <YAxis
                            yAxisId="left"
                            tick={{ fill: axisColor, fontSize: 10 }}
                            tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 100]}
                            tick={{ fill: axisColor, fontSize: 10 }}
                            tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip content={<ParetoTooltip isLight={isLight} />} />
                        <Bar
                            yAxisId="left"
                            dataKey="factura"
                            name="Factura neta"
                            fill={CINTE_PRIMARY}
                            radius={[4, 4, 0, 0]}
                            cursor={onOpenCliente ? 'pointer' : 'default'}
                            onClick={(ev) => {
                                const row = ev?.payload;
                                if (row?.cliente) onOpenCliente?.(row.cliente);
                            }}
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulativePct"
                            name="% acumulado"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={{ r: 3, fill: '#f59e0b' }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
