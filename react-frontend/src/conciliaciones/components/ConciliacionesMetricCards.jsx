function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

/**
 * KPIs de conciliación — misma línea gráfica que Dashboard conciliaciones (`dash.card`).
 */
export default function ConciliacionesMetricCards({
    totales,
    cardClass = '',
    headingAccent,
    labelMuted,
    isLight,
    compact = false
}) {
    const t = totales || {};
    const items = [
        { label: 'Suma tarifas', value: formatCop(t.tarifaSum), tabular: true },
        { label: 'Deducciones (novedades)', value: formatCop(t.deduccionSum), tabular: true },
        { label: 'Total factura', value: formatCop(t.facturaSum), tabular: true },
        {
            label: 'Colaboradores / con novedad',
            value: `${t.colaboradores ?? 0} / ${t.conNovedad ?? 0}`,
            tabular: false
        }
    ];

    const shell = cardClass || (isLight != null
        ? isLight
            ? 'rounded-2xl border border-slate-200 bg-white shadow-md'
            : 'rounded-2xl border border-slate-700/50 bg-[#1e293b] shadow-lg'
        : '');

    const pad = compact ? 'p-3' : 'p-4';
    const labelCls = compact
        ? `text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`
        : `text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`;
    const valueCls = compact
        ? `mt-1 truncate font-heading text-sm font-extrabold sm:text-base ${headingAccent}`
        : `mt-2 font-heading text-lg font-extrabold sm:text-xl ${headingAccent}`;
    const hover =
        shell && isLight != null
            ? isLight
                ? 'transition-shadow hover:shadow-lg'
                : 'transition-shadow hover:shadow-xl hover:shadow-[#2F7BB8]/10'
            : '';

    return (
        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${compact ? 'gap-2' : 'gap-3'}`}>
            {items.map(({ label, value, tabular }) => (
                <div
                    key={label}
                    className={`min-w-0 ${shell ? `${shell} ${pad} ${hover}` : ''}`}
                >
                    <p className={labelCls}>{label}</p>
                    <p className={`${valueCls}${tabular ? ' tabular-nums' : ''}`}>{value}</p>
                </div>
            ))}
        </div>
    );
}
