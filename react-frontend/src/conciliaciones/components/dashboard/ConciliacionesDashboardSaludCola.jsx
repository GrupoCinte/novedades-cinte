import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from '../../../contratacion/constants/rechartsTheme.js';
import { CINTE_HEADING } from '../../conciliacionesLayout.js';

function SaludTooltip({ active, payload, isLight, total }) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
    const panel = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
    return (
        <div style={panel} className="text-xs">
            <p className="font-semibold">{row.name}</p>
            <p className="mt-1 tabular-nums">
                {row.value} servicio{row.value === 1 ? '' : 's'} ({pct}%)
            </p>
        </div>
    );
}

export default function ConciliacionesDashboardSaludCola({
    data,
    dash,
    isLight,
    labelMuted,
    onOpenFacturacion
}) {
    const total = (Array.isArray(data) ? data : []).reduce((s, d) => s + (d.value || 0), 0);

    if (!data?.length) {
        return (
            <div className={`${dash.card} flex min-h-[320px] flex-col p-4 sm:p-5`}>
                <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Salud de la cola</h2>
                <p className={`mt-auto py-8 text-center text-sm ${labelMuted}`}>Sin datos</p>
            </div>
        );
    }

    return (
        <div className={`${dash.card} flex min-h-[320px] flex-col p-4 sm:p-5`}>
            <h2 className={`mb-1 font-heading text-sm font-bold ${CINTE_HEADING}`}>Salud de la cola</h2>
            <p className={`mb-3 text-xs ${labelMuted}`}>{total} servicio{total === 1 ? '' : 's'} en el mes</p>
            <div className="h-[min(280px,42vh)] w-full min-h-[220px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="48%"
                            innerRadius={52}
                            outerRadius={82}
                            paddingAngle={2}
                            cursor={onOpenFacturacion ? 'pointer' : 'default'}
                            onClick={() => onOpenFacturacion?.()}
                        >
                            {data.map((entry) => (
                                <Cell key={entry.key} fill={entry.fill} />
                            ))}
                        </Pie>
                        <Tooltip content={<SaludTooltip isLight={isLight} total={total} />} />
                        <Legend
                            onClick={() => onOpenFacturacion?.()}
                            formatter={(value) => (
                                <span className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>{value}</span>
                            )}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
