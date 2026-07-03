import { useMemo } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { useModuleTheme } from '../../moduleTheme.js';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import {
    computeNovedadesDeduccionCop,
    computeNovedadesIncrementoCop,
    resolveFilaEstadoDisplay,
    formatCopCached,
    computeAdvanceDisplayTotals,
    formatSaldoAnticipoLabel
} from '../facturacionLogic.js';

function formatCop(n) {
    return formatCopCached(n);
}

function NovedadesImpactoCell({ row, isLight }) {
    const advance = computeAdvanceDisplayTotals(row);
    const incremento = computeNovedadesIncrementoCop(row.novedadesSumaCop);
    const deduccion = computeNovedadesDeduccionCop(row.novedadesSumCop);
    const hasAdvance =
        advance.billingAdvanceMode &&
        (advance.ajusteAnticipoSumaCop > 0 || advance.ajusteAnticipoSumCop > 0);
    const hasCurrent = incremento > 0 || deduccion > 0;
    const pendingInfo =
        advance.billingAdvanceMode && (row.pendingAdjustmentCount > 0 || row.novedadesInfoCount > 0);

    if (!hasAdvance && !hasCurrent && !pendingInfo) {
        return <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>—</span>;
    }

    return (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
            {hasCurrent ? (
                <>
                    {incremento > 0 ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">+ {formatCop(incremento)}</span>
                    ) : null}
                    {deduccion > 0 ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">− {formatCop(deduccion)}</span>
                    ) : null}
                </>
            ) : null}
            {hasAdvance ? (
                <>
                    {advance.ajusteAnticipoSumaCop > 0 ? (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            + {formatCop(advance.ajusteAnticipoSumaCop)} adj.
                        </span>
                    ) : null}
                    {advance.ajusteAnticipoSumCop > 0 ? (
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                            − {formatCop(advance.ajusteAnticipoSumCop)} adj.
                        </span>
                    ) : null}
                    {advance.saldoAnticipoTipo ? (
                        <span
                            className={`text-[10px] font-bold uppercase tracking-wide ${
                                advance.saldoAnticipoTipo === 'favor'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                            }`}
                        >
                            {formatSaldoAnticipoLabel(advance.saldoAnticipoTipo, advance.ajusteAnticipoMesLabel)}
                        </span>
                    ) : null}
                </>
            ) : null}
            {pendingInfo && !hasAdvance ? (
                <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Liquidación mes sig.
                </span>
            ) : null}
        </div>
    );
}

export default function ConciliacionesTabla({
    rows,
    onVerDetalle,
    onFacturar,
    onEliminar,
    /** Clic en la fila abre detalle; oculta columna Acciones. */
    onRowClick = null,
    headingAccent,
    labelMuted,
    /** Columna Cliente (vista «Todos / seleccionar»). */
    showClienteColumn = false,
    /** Solo `<table>` dentro del shell de Gestión (sin cardFlex propio). */
    embedded = false,
    dense = false,
    loading = false,
    refreshing = false,
    loadingMessage = 'Cargando base de datos…',
    /** Estado del servicio/mes (Enviada, Conciliada) para reflejar en filas en finanzas. */
    estadoServicio = null
}) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const th = dense ? 'px-2.5 py-2 font-semibold text-[10px]' : 'p-4 font-semibold';
    const thFirst = dense ? 'px-2.5 py-2 pl-4 font-semibold text-[10px]' : 'p-4 pl-6 font-semibold';
    const thLast = dense ? 'px-2.5 py-2 pr-4 text-right font-semibold text-[10px]' : 'p-4 pr-6 text-right font-semibold';
    const tdPad = dense ? 'p-2.5' : null;
    const tdFirst = dense
        ? `p-2.5 pl-4 font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`
        : dash.tdName;
    const tdRest = dense
        ? `p-2.5 max-w-[14rem] truncate ${isLight ? 'text-slate-700' : 'text-slate-300'}`
        : dash.tdCell;
    const tdMutedCell = dense ? `p-2.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}` : dash.tdMuted;
    const tdActions = dense ? 'p-2.5 pr-4' : 'p-4 pr-6';
    const emptyPad = dense ? 'p-8' : 'p-12';
    const showEliminar = typeof onEliminar === 'function' && !onRowClick;
    const showActionsColumn = !onRowClick && (typeof onFacturar === 'function' || typeof onVerDetalle === 'function');
    const colCount = 6 + (showClienteColumn ? 1 : 0) + (showEliminar ? 1 : 0) + (showActionsColumn ? 1 : 0);

    const tableEl = (
        <table className={`w-full border-collapse text-left whitespace-nowrap ${dense ? 'min-w-[820px] text-xs' : 'min-w-[900px] md:min-w-full text-sm'} ${refreshing ? 'opacity-80 transition-opacity' : ''}`}>
            <thead>
                <tr className={dash.thead}>
                    <th className={thFirst}>Colaborador</th>
                    {showClienteColumn ? <th className={th}>Cliente</th> : null}
                    <th className={th}>Tarifa Cliente</th>
                    <th className={th}>Novedades</th>
                    <th className={th}>Incremento/Deducción</th>
                    <th className={th}>Factura</th>
                    <th className={th}>Estado</th>
                    {showEliminar ? <th className={th}>Eliminar</th> : null}
                    {showActionsColumn ? <th className={thLast}>Acciones</th> : null}
                </tr>
            </thead>
            <tbody className={dash.tbody}>
                {loading ? (
                    <tr>
                        <td colSpan={colCount} className={`${emptyPad} text-center font-medium ${dash.muted}`}>
                            {loadingMessage}
                        </td>
                    </tr>
                ) : rows.length === 0 ? (
                    <tr>
                        <td colSpan={colCount} className={`${emptyPad} text-center font-medium ${dash.muted}`}>
                            No se encontraron registros.
                        </td>
                    </tr>
                ) : (
                    rows.map((r) => (
                        <tr
                            key={showClienteColumn ? `${r.cliente || ''}::${r.cedula}` : r.cedula}
                            className={`${dash.trHover}${onRowClick ? ' cursor-pointer' : ''}`}
                            onClick={onRowClick ? () => onRowClick(r) : undefined}
                        >
                            <td className={tdFirst}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span>{r.nombre}</span>
                                    {r.salidaMes ? (
                                        <span
                                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                isLight
                                                    ? 'border border-amber-300 bg-amber-50 text-amber-900'
                                                    : 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
                                            }`}
                                        >
                                            Salida mes
                                        </span>
                                    ) : null}
                                    {r.sinServicioAsignado ? (
                                        <span
                                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                isLight
                                                    ? 'border border-slate-300 bg-slate-50 text-slate-700'
                                                    : 'border border-slate-500/30 bg-slate-500/10 text-slate-300'
                                            }`}
                                        >
                                            Sin servicio
                                        </span>
                                    ) : null}
                                </div>
                                <div className={dash.tdSmall}>{r.cedula}</div>
                            </td>
                            {showClienteColumn ? (
                                <td className={`${tdRest} max-w-[12rem]`} title={r.cliente || ''}>
                                    {r.cliente || '—'}
                                </td>
                            ) : null}
                            <td className={`${tdRest} tabular-nums`}>
                                {formatCop(r.tarifaCliente)}
                                {r.prorrateoAplicado ? (
                                    <span className={`mt-0.5 block text-[10px] font-medium ${labelMuted}`}>
                                        Prorrateo {r.diasFacturables}/{r.diasMes} d.
                                    </span>
                                ) : null}
                                {r.moneda ? <span className={`ml-1 text-xs ${labelMuted}`}>{r.moneda}</span> : null}
                            </td>
                            <td className={tdRest}>
                                {r.novedadesCount > 0 ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onVerDetalle(r);
                                        }}
                                        className="text-left text-sm font-semibold text-[#65BCF7] underline-offset-2 hover:underline"
                                    >
                                        {r.novedadesCount} aprobadas
                                    </button>
                                ) : (
                                    <span className={dash.tdMuted}>0</span>
                                )}
                            </td>
                            <td className={tdRest}>
                                <NovedadesImpactoCell row={r} isLight={isLight} />
                            </td>
                            <td className={`${tdRest} tabular-nums font-semibold ${headingAccent}`}>
                                {formatCop(r.facturaCop)}
                            </td>
                            <td className={tdPad || 'p-4'}>
                                {(() => {
                                    const { displayKey, label } = resolveFilaEstadoDisplay(
                                        r.estado,
                                        estadoServicio
                                    );
                                    const badgeBase =
                                        'inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider';
                                    const styles = {
                                        PENDIENTE: isLight
                                            ? 'border-amber-300 bg-amber-100 text-amber-900'
                                            : 'border-amber-500/20 bg-amber-500/10 text-amber-400',
                                        APROBADO_ANALISTA: isLight
                                            ? 'border-[#65BCF7]/40 bg-[#2F7BB8]/10 text-[#004D87]'
                                            : 'border-[#65BCF7]/30 bg-[#2F7BB8]/15 text-[#65BCF7]',
                                        APROBADO_FINANZAS: isLight
                                            ? 'border-violet-300 bg-violet-100 text-violet-900'
                                            : 'border-violet-500/20 bg-violet-500/10 text-violet-400',
                                        DEVUELTA: isLight
                                            ? 'border-rose-300 bg-rose-100 text-rose-900'
                                            : 'border-rose-500/20 bg-rose-500/10 text-rose-400',
                                        CONCILIADA: isLight
                                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
                                        SERVICIO_LISTO_EXPORT: isLight
                                            ? 'border-violet-300 bg-violet-100 text-violet-900'
                                            : 'border-violet-500/20 bg-violet-500/10 text-violet-400',
                                        SERVICIO_ENVIADA: isLight
                                            ? 'border-[#65BCF7]/40 bg-[#2F7BB8]/10 text-[#004D87]'
                                            : 'border-[#65BCF7]/30 bg-[#2F7BB8]/15 text-[#65BCF7]'
                                    };
                                    return (
                                        <span className={`${badgeBase} ${styles[displayKey] || styles.PENDIENTE}`}>
                                            {label}
                                        </span>
                                    );
                                })()}
                            </td>
                            {showEliminar ? (
                                <td className={tdPad || 'p-4'}>
                                    {r.cerrado ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEliminar(r);
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/20"
                                            title="Eliminar registro de facturación"
                                        >
                                            <Trash2 size={14} aria-hidden />
                                            Eliminar
                                        </button>
                                    ) : (
                                        <span className={dash.tdMuted}>—</span>
                                    )}
                                </td>
                            ) : null}
                            {showActionsColumn ? (
                                <td className={tdActions}>
                                    <div className="flex items-center justify-end gap-2">
                                        {onFacturar ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onFacturar(r);
                                                }}
                                                className={dash.actionBtn}
                                            >
                                                {r.cerrado ? 'Editar' : 'Revisión'}
                                            </button>
                                        ) : null}
                                        {onVerDetalle ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onVerDetalle(r);
                                                }}
                                                className={dash.actionBtn}
                                            >
                                                <Eye size={14} aria-hidden />
                                                Ver detalle
                                            </button>
                                        ) : null}
                                    </div>
                                </td>
                            ) : null}
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );

    if (embedded) {
        return tableEl;
    }

    if (!rows.length && !loading) {
        return (
            <div className={`${dash.card} p-6 text-center text-sm ${dash.muted}`}>
                No hay colaboradores activos para este cliente o no hay datos en el periodo seleccionado.
            </div>
        );
    }

    return (
        <div className={`${dash.cardFlex} overflow-hidden`}>
            <div className={dash.tableWrap}>
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">{tableEl}</div>
            </div>
        </div>
    );
}
