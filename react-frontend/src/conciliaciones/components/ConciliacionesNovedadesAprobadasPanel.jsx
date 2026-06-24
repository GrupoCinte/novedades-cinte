import { useMemo } from 'react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { getNovedadImpactoFacturacion, computeFacturaLedgerTotal } from '../facturacionLogic.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function impactRowClasses(impacto, isLight) {
    if (impacto === 'suma') {
        return isLight
            ? 'border-emerald-400/70 bg-emerald-50/80 ring-1 ring-emerald-400/30'
            : 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/25';
    }
    return isLight
        ? 'border-rose-400/70 bg-rose-50/80 ring-1 ring-rose-400/30'
        : 'border-rose-500/50 bg-rose-500/10 ring-1 ring-rose-500/25';
}

function impactMontoClasses(impacto) {
    return impacto === 'suma' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}

function formatCantidadImpacto(row) {
    const q = Number(row.cantidad);
    if (!Number.isFinite(q) || q <= 0) return null;
    if (row.medida === 'days') return q === 1 ? '1 día' : `${q} días`;
    if (row.medida === 'hours') return `${q} h`;
    return null;
}

/** Tabla de novedades aprobadas (reutilizable embebida en revisión). */
export default function ConciliacionesNovedadesAprobadasPanel({
    items,
    loading,
    isLight,
    embedded = false,
    tarifaCliente = null,
    facturaCop = null
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const ledgerMode = tarifaCliente != null;
    const ledgerTotal = useMemo(() => {
        if (!ledgerMode) return null;
        return computeFacturaLedgerTotal(tarifaCliente, items, facturaCop);
    }, [ledgerMode, tarifaCliente, facturaCop, items]);

    const thMonto = 'px-3 py-2 text-right font-heading text-[10px] font-bold uppercase tracking-wide w-[9.5rem] min-w-[9.5rem]';
    const tdMonto = `${dash.tdCell} tabular-nums text-right font-semibold w-[9.5rem] min-w-[9.5rem]`;

    return (
        <div className={embedded ? 'space-y-2' : 'space-y-3'}>
            <h3 className={`font-heading text-xs font-bold uppercase tracking-wider ${dash.titleLg}`}>
                {ledgerMode ? 'Desglose tarifa y novedades' : 'Novedades aprobadas'}
            </h3>
            {loading ? (
                <p className={`text-sm ${dash.modalMuted}`}>Cargando novedades…</p>
            ) : !ledgerMode && !items?.length ? (
                <p className={`text-sm ${dash.modalMuted}`}>No hay novedades en el periodo.</p>
            ) : (
                <div className={`${dash.card} min-h-0 overflow-hidden`}>
                    <div className={`${dash.tableWrap} max-h-[min(44vh,18rem)] overflow-auto`}>
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className={dash.thead}>
                                <tr>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">
                                        {ledgerMode ? 'Concepto' : 'Tipo'}
                                    </th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">
                                        Fechas
                                    </th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">
                                        Aprobador
                                    </th>
                                    <th className={thMonto}>Monto</th>
                                </tr>
                            </thead>
                            <tbody className={dash.tbody}>
                                {ledgerMode ? (
                                    <tr className={isLight ? 'bg-slate-50/90' : 'bg-slate-800/40'}>
                                        <td className={`${dash.tdCell} font-semibold`}>Tarifa Cliente</td>
                                        <td className={dash.tdMuted}>—</td>
                                        <td className={dash.tdMuted}>—</td>
                                        <td className={`${tdMonto} ${dash.titleLg}`}>{formatCop(tarifaCliente)}</td>
                                    </tr>
                                ) : null}

                                {(items || []).map((row) => {
                                    const impacto = getNovedadImpactoFacturacion(row.tipoNovedad, row);
                                    const monto = row.montoCop != null ? Number(row.montoCop) : null;
                                    const cantidadLabel = formatCantidadImpacto(row);
                                    const montoLabel =
                                        monto != null && Number.isFinite(monto) && monto !== 0
                                            ? `${impacto === 'suma' ? '+' : '−'} ${formatCop(Math.abs(monto))}`
                                            : '—';

                                    return (
                                        <tr key={row.id} className={dash.trHover}>
                                            <td className="p-1.5">
                                                <div
                                                    className={`rounded-md border-l-4 px-2.5 py-2 ${impactRowClasses(impacto, isLight)}`}
                                                >
                                                    <span className={`text-sm font-medium ${dash.tdLead}`}>{row.tipoNovedad}</span>
                                                    {cantidadLabel ? (
                                                        <span className={`mt-0.5 block text-[10px] ${dash.modalMuted}`}>
                                                            {cantidadLabel}
                                                            {row.montoCalculado ? ' · calculado' : ''}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className={`${dash.tdMuted} align-middle text-xs`}>
                                                {row.fechaInicio || row.fecha || '—'}
                                                {row.fechaFin && row.fechaFin !== row.fechaInicio ? ` → ${row.fechaFin}` : ''}
                                            </td>
                                            <td className={`${dash.tdCell} align-middle text-xs`}>
                                                {row.aprobador || 'Aprobador CINTE'}
                                            </td>
                                            <td className={`${tdMonto} align-middle ${impactMontoClasses(impacto)}`}>
                                                {montoLabel}
                                            </td>
                                        </tr>
                                    );
                                })}

                                {ledgerMode && !items?.length ? (
                                    <tr>
                                        <td colSpan={4} className={`px-3 py-2 text-xs ${dash.modalMuted}`}>
                                            Sin novedades en el periodo.
                                        </td>
                                    </tr>
                                ) : null}

                                {ledgerMode ? (
                                    <tr className={`border-t-2 ${isLight ? 'border-slate-300 bg-slate-100/80' : 'border-slate-600 bg-slate-800/60'}`}>
                                        <td className={`${dash.tdCell} font-heading text-xs font-extrabold uppercase`}>
                                            Total a facturar
                                        </td>
                                        <td className={dash.tdMuted}>—</td>
                                        <td className={dash.tdMuted}>—</td>
                                        <td className={`${tdMonto} text-base font-extrabold ${dash.titleLg}`}>
                                            {formatCop(ledgerTotal)}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
