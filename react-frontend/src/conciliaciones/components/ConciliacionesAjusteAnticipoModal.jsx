import { useMemo } from 'react';
import { X, TrendingDown, TrendingUp } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { CINTE_HEADING } from '../conciliacionesLayout.js';
import { formatSaldoAnticipoLabel, resolveSaldoAnticipoNetCop } from '../facturacionLogic.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

/**
 * Detalle del ajuste de mes anticipado (saldo a favor / en contra).
 */
export default function ConciliacionesAjusteAnticipoModal({
    open,
    onClose,
    totales,
    detailRows = [],
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    if (!open) return null;

    const t = totales || {};
    const aFavor = Math.round(Number(t.ajusteAnticipoSuma) || 0);
    const enContra = Math.round(Number(t.ajusteAnticipoSum) || 0);
    const neto = resolveSaldoAnticipoNetCop(t.saldoAnticipoNetCop, aFavor, enContra);
    const tipo = t.saldoAnticipoTipo ?? (neto > 0 ? 'contra' : neto < 0 ? 'favor' : null);
    const mesLabel = t.ajusteAnticipoMesLabel || null;

    const filasDetalle = (Array.isArray(detailRows) ? detailRows : []).filter(
        (r) => (Number(r.ajusteAnticipoSumaCop) || 0) > 0 || (Number(r.ajusteAnticipoSumCop) || 0) > 0
    );

    const saldoCls =
        tipo === 'favor'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tipo === 'contra'
              ? 'text-amber-600 dark:text-amber-400'
              : dash.modalMuted;

    return (
        <div className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-ajuste-anticipo-title">
            <button
                type="button"
                className="modal-glass-scrim absolute inset-0 transition-opacity"
                aria-label="Cerrar modal"
                onClick={onClose}
            />

            <div className={`${dash.modalCardWide} max-w-lg font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 id="modal-ajuste-anticipo-title" className={`font-heading ${dash.title2xl}`}>
                            Ajuste mes anticipado
                        </h2>
                        {mesLabel ? (
                            <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                                Novedades con fecha efectiva en {mesLabel}
                            </p>
                        ) : null}
                    </div>
                    <button type="button" onClick={onClose} className={dash.modalClose} aria-label="Cerrar modal">
                        <X size={18} />
                    </button>
                </div>

                <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1`}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div
                            className={`rounded-xl border p-4 ${isLight ? 'border-emerald-200 bg-emerald-50/80' : 'border-emerald-500/25 bg-emerald-500/10'}`}
                        >
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
                                <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${dash.modalMuted}`}>
                                    A favor (+)
                                </p>
                            </div>
                            <p className={`mt-2 font-heading text-xl font-extrabold tabular-nums ${CINTE_HEADING}`}>
                                {formatCop(aFavor)}
                            </p>
                            <p className={`mt-1 text-xs ${dash.modalMuted}`}>Bonos, horas extra y sumas del mes anterior</p>
                        </div>

                        <div
                            className={`rounded-xl border p-4 ${isLight ? 'border-amber-200 bg-amber-50/80' : 'border-amber-500/25 bg-amber-500/10'}`}
                        >
                            <div className="flex items-center gap-2">
                                <TrendingDown size={16} className="text-amber-600 dark:text-amber-400" aria-hidden />
                                <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${dash.modalMuted}`}>
                                    En contra (−)
                                </p>
                            </div>
                            <p className={`mt-2 font-heading text-xl font-extrabold tabular-nums ${CINTE_HEADING}`}>
                                {formatCop(enContra)}
                            </p>
                            <p className={`mt-1 text-xs ${dash.modalMuted}`}>Días no trabajados y deducciones del mes anterior</p>
                        </div>
                    </div>

                    <div
                        className={`rounded-xl border px-4 py-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-600/50 bg-slate-800/40'}`}
                    >
                        <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${dash.modalMuted}`}>
                            Resultado neto
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <p className={`font-heading text-2xl font-extrabold tabular-nums ${CINTE_HEADING}`}>
                                {formatCop(Math.abs(neto))}
                            </p>
                            {tipo ? (
                                <span className={`text-sm font-bold uppercase ${saldoCls}`}>
                                    {formatSaldoAnticipoLabel(tipo, null)}
                                </span>
                            ) : (
                                <span className={`text-sm ${dash.modalMuted}`}>Sin saldo neto</span>
                            )}
                        </div>
                        <p className={`mt-2 text-xs ${dash.modalMuted}`}>
                            Se suma a favor y se resta en contra sobre la tarifa del mes para obtener el total a facturar.
                        </p>
                    </div>

                    {filasDetalle.length ? (
                        <div className={`overflow-hidden rounded-xl border ${isLight ? 'border-slate-200' : 'border-slate-600/50'}`}>
                            <p
                                className={`border-b px-3 py-2 text-[10px] font-heading font-bold uppercase tracking-wider ${dash.modalMuted} ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-600/50 bg-slate-800/40'}`}
                            >
                                Por consultor ({filasDetalle.length})
                            </p>
                            <div className="max-h-48 overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className={dash.thead}>
                                        <tr>
                                            <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase">Consultor</th>
                                            <th className="px-3 py-2 text-right font-heading text-[10px] font-bold uppercase">A favor</th>
                                            <th className="px-3 py-2 text-right font-heading text-[10px] font-bold uppercase">En contra</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filasDetalle.map((r) => (
                                            <tr key={r.cedula} className={dash.trHover}>
                                                <td className={`${dash.tdName} max-w-[10rem] truncate`} title={r.nombre}>
                                                    {r.nombre || r.cedula}
                                                </td>
                                                <td className={`${dash.tdCell} text-right tabular-nums text-emerald-600 dark:text-emerald-400`}>
                                                    {formatCop(r.ajusteAnticipoSumaCop)}
                                                </td>
                                                <td className={`${dash.tdCell} text-right tabular-nums text-amber-600 dark:text-amber-400`}>
                                                    {formatCop(r.ajusteAnticipoSumCop)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
