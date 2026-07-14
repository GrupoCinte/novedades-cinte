import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    RECHARTS_TOOLTIP_CONTENT_STYLE,
    RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT
} from '../../../contratacion/constants/rechartsTheme.js';
import { ALERTA_TIPO_LABELS } from '../../facturacionAggregate.js';
import { CINTE_HEADING } from '../../conciliacionesLayout.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function GapTooltip({ active, payload, isLight }) {
    if (!active || !payload?.length) return null;
    const panel = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
    return (
        <div style={panel} className="text-xs">
            {payload.map((p) => (
                <p key={p.dataKey} className="tabular-nums">
                    {p.name}: {formatCop(p.value)}
                </p>
            ))}
        </div>
    );
}

export default function ConciliacionesDashboardGapCierre({ gap, dash, isLight, labelMuted }) {
    if (!gap || gap.facturaTotal <= 0) {
        return (
            <div className={`${dash.card} flex min-h-[280px] flex-col p-4 sm:p-5`}>
                <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Gap de cierre</h2>
                <p className={`mt-auto py-8 text-center text-sm ${labelMuted}`}>Sin datos</p>
            </div>
        );
    }

    const barData = [gap.barRow];

    return (
        <div className={`${dash.card} flex min-h-[280px] flex-col p-4 sm:p-5`}>
            <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Gap de cierre</h2>
            <p className={`mt-1 text-xs ${labelMuted}`}>
                Facturación en servicios con cierre vencido o bajo avance
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${labelMuted}`}>En riesgo</p>
                    <p className="mt-1 font-heading text-lg font-extrabold tabular-nums text-orange-500">
                        {formatCop(gap.facturaEnRiesgo)}
                    </p>
                </div>
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${labelMuted}`}>% del mes</p>
                    <p className={`mt-1 font-heading text-lg font-extrabold tabular-nums ${CINTE_HEADING}`}>
                        {gap.pctEnRiesgo}%
                    </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${labelMuted}`}>Sin gap</p>
                    <p className="mt-1 font-heading text-lg font-extrabold tabular-nums text-emerald-500">
                        {formatCop(gap.facturaSinGap)}
                    </p>
                </div>
            </div>

            <div className="mt-4 h-[72px] w-full flex-1 min-h-[56px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={barData} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                        <XAxis type="number" hide tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
                        <YAxis type="category" dataKey="label" hide width={0} />
                        <Tooltip content={<GapTooltip isLight={isLight} />} />
                        <Bar dataKey="sin_gap" name="Sin gap" stackId="gap" fill="#10b981" radius={[4, 0, 0, 4]} />
                        <Bar dataKey="cierre_vencido" name={ALERTA_TIPO_LABELS.cierre_vencido} stackId="gap" fill="#f97316" />
                        <Bar dataKey="bajo_avance" name={ALERTA_TIPO_LABELS.bajo_avance} stackId="gap" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-wide">
                {(gap.segments || []).map((s) => (
                    <span key={s.key} className={`inline-flex items-center gap-1.5 ${labelMuted}`}>
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.fill }} aria-hidden />
                        {s.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
