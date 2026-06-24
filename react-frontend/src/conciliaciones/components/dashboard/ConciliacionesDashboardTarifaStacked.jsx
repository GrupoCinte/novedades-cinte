import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from '../../../contratacion/constants/rechartsTheme.js';
import { CINTE_HEADING, CINTE_PRIMARY } from '../../conciliacionesLayout.js';

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
            <p className="tabular-nums">Tarifa: {formatCop(row.tarifa)}</p>
            <p className="tabular-nums">Deducción: {formatCop(row.deduccion)}</p>
            <p className="tabular-nums font-semibold">Factura neta: {formatCop(row.factura)}</p>
        </div>
    );
}

export default function ConciliacionesDashboardTarifaStacked({ data, dash, isLight, labelMuted }) {
    if (!data?.length) {
        return (
            <div className={`${dash.card} p-4 sm:p-5`}>
                <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Tarifa, deducción y factura por cliente</h2>
                <p className={`py-8 text-center text-sm ${labelMuted}`}>Sin datos</p>
            </div>
        );
    }

    const gridColor = isLight ? '#e2e8f0' : '#1a3a56';
    const axisColor = isLight ? '#475569' : '#94a3b8';

    return (
        <div className={`${dash.card} p-4 sm:p-5`}>
            <h2 className={`mb-4 font-heading text-sm font-bold ${CINTE_HEADING}`}>Tarifa, deducción y factura por cliente</h2>
            <div className="mb-3 flex flex-wrap gap-4 text-[10px] uppercase tracking-wide">
                <span className={`inline-flex items-center gap-1.5 ${labelMuted}`}>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CINTE_PRIMARY }} aria-hidden />
                    Factura neta
                </span>
                <span className={`inline-flex items-center gap-1.5 ${labelMuted}`}>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/90" aria-hidden />
                    Deducción
                </span>
            </div>
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
                        <Bar dataKey="factura" name="Factura neta" stackId="tarifa" fill={CINTE_PRIMARY} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="deduccion" name="Deducción" stackId="tarifa" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
