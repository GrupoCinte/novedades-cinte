function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

export default function ConciliacionesMetricCards({ totales, cardClass, headingAccent, labelMuted, compact = false }) {
    const t = totales || {};
    const items = [
        { label: 'Suma tarifas', value: formatCop(t.tarifaSum) },
        { label: 'Deducciones (novedades)', value: formatCop(t.deduccionSum) },
        { label: 'Total factura', value: formatCop(t.facturaSum) },
        { label: 'Colaboradores / con novedad', value: `${t.colaboradores ?? 0} / ${t.conNovedad ?? 0}` }
    ];

    if (compact) {
        return (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {items.map(({ label, value }) => (
                    <div key={label} className="min-w-0">
                        <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>{label}</p>
                        <p className={`mt-0.5 truncate font-heading text-sm font-extrabold sm:text-base ${headingAccent}`}>{value}</p>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {items.map(({ label, value }) => (
                <div key={label} className={`${cardClass} p-4`}>
                    <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>{label}</p>
                    <p className={`mt-2 font-heading text-lg font-extrabold sm:text-xl ${headingAccent}`}>{value}</p>
                </div>
            ))}
        </div>
    );
}
