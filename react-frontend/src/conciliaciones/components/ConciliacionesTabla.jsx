function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

export default function ConciliacionesTabla({
    rows,
    onVerDetalle,
    tableSurface,
    tableThead,
    tableRowBorder,
    headingAccent,
    labelMuted,
    navOutline
}) {
    if (!rows.length) {
        return (
            <div className={`rounded-xl border p-6 text-center text-sm ${tableSurface} ${labelMuted}`}>
                No hay colaboradores activos para este cliente o no hay datos en el periodo seleccionado.
            </div>
        );
    }
    return (
        <div className={`overflow-x-auto rounded-xl border ${tableSurface}`}>
            <table className="w-full min-w-[720px] text-left text-sm">
                <thead className={tableThead}>
                    <tr>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide">Colaborador</th>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide">Perfil</th>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide">Tarifa</th>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide">Novedades</th>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide">Deducción</th>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide">Factura</th>
                        <th className="px-3 py-2.5 font-heading text-[10px] font-bold uppercase tracking-wide" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.cedula} className={`border-t ${tableRowBorder}`}>
                            <td className="px-3 py-2">
                                <div className={`font-semibold ${headingAccent}`}>{r.nombre}</div>
                                <div className={`text-xs ${labelMuted}`}>{r.cedula}</div>
                            </td>
                            <td className={`px-3 py-2 text-xs ${labelMuted}`}>{r.perfil || '—'}</td>
                            <td className="px-3 py-2 tabular-nums">
                                {formatCop(r.tarifaCliente)}
                                {r.moneda ? <span className={`ml-1 text-xs ${labelMuted}`}>{r.moneda}</span> : null}
                            </td>
                            <td className="px-3 py-2">
                                {r.novedadesCount > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => onVerDetalle(r)}
                                        className={`text-sm font-semibold text-[#65BCF7] underline-offset-2 hover:underline`}
                                    >
                                        {r.novedadesCount} aprobadas
                                    </button>
                                ) : (
                                    <span className={labelMuted}>0</span>
                                )}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{formatCop(r.novedadesSumCop)}</td>
                            <td className={`px-3 py-2 tabular-nums font-semibold ${headingAccent}`}>{formatCop(r.facturaCop)}</td>
                            <td className="px-3 py-2 text-right">
                                <button
                                    type="button"
                                    disabled={!r.novedadesCount}
                                    onClick={() => onVerDetalle(r)}
                                    className={`rounded-lg px-2 py-1 text-xs font-semibold ${navOutline} disabled:opacity-40`}
                                >
                                    Detalle
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
