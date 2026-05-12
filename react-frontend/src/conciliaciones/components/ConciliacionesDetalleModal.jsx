import { X } from 'lucide-react';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

export default function ConciliacionesDetalleModal({
    open,
    onClose,
    loading,
    items,
    colaboradorLabel,
    cardPanel,
    tableSurface,
    tableThead,
    tableRowBorder,
    headingAccent,
    labelMuted,
    navOutline
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
            <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" aria-label="Cerrar" onClick={onClose} />
            <div className={`relative z-10 flex max-h-[min(90dvh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl ${cardPanel}`}>
                <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${tableRowBorder}`}>
                    <div className="min-w-0">
                        <h2 className={`font-heading text-base font-extrabold ${headingAccent}`}>Novedades aprobadas</h2>
                        <p className={`mt-0.5 truncate text-xs ${labelMuted}`}>{colaboradorLabel}</p>
                    </div>
                    <button type="button" onClick={onClose} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${navOutline}`} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    {loading ? (
                        <p className={`text-sm ${labelMuted}`}>Cargando…</p>
                    ) : !items.length ? (
                        <p className={`text-sm ${labelMuted}`}>No hay novedades en el periodo.</p>
                    ) : (
                        <div className={`overflow-x-auto rounded-lg border ${tableSurface}`}>
                            <table className="w-full min-w-[640px] text-left text-sm">
                                <thead className={tableThead}>
                                    <tr>
                                        <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Tipo</th>
                                        <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Monto</th>
                                        <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Fechas</th>
                                        <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Id</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => (
                                        <tr key={row.id} className={`border-t ${tableRowBorder}`}>
                                            <td className="px-3 py-2">{row.tipoNovedad}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.montoCop != null ? formatCop(row.montoCop) : '—'}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500">
                                                {row.fechaInicio || row.fecha || '—'}
                                                {row.fechaFin && row.fechaFin !== row.fechaInicio ? ` → ${row.fechaFin}` : ''}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-slate-500">{String(row.id || '').slice(0, 8)}…</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
