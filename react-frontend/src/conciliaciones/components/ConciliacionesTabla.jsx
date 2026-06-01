import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import { useModuleTheme } from '../../moduleTheme.js';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

export default function ConciliacionesTabla({
    rows,
    onVerDetalle,
    onFacturar,
    headingAccent,
    labelMuted,
    /** Columna Cliente (vista «Todos / seleccionar»). */
    showClienteColumn = false,
    /** Solo `<table>` dentro del shell de Gestión (sin cardFlex propio). */
    embedded = false,
    dense = false,
    loading = false,
    loadingMessage = 'Cargando base de datos…'
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
    const colCount = showClienteColumn ? 9 : 8;

    const tableEl = (
        <table className={`w-full border-collapse text-left whitespace-nowrap ${dense ? 'min-w-[820px] text-xs' : 'min-w-[900px] md:min-w-full text-sm'}`}>
            <thead>
                <tr className={dash.thead}>
                    <th className={thFirst}>Colaborador</th>
                    {showClienteColumn ? <th className={th}>Cliente</th> : null}
                    <th className={th}>Perfil</th>
                    <th className={th}>Tarifa Cliente</th>
                    <th className={th}>Novedades</th>
                    <th className={th}>Monto</th>
                    <th className={th}>Factura</th>
                    <th className={th}>Estado</th>
                    <th className={thLast}>Acciones</th>
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
                            className={dash.trHover}
                        >
                            <td className={tdFirst}>
                                <div>{r.nombre}</div>
                                <div className={dash.tdSmall}>{r.cedula}</div>
                            </td>
                            {showClienteColumn ? (
                                <td className={`${tdRest} max-w-[12rem]`} title={r.cliente || ''}>
                                    {r.cliente || '—'}
                                </td>
                            ) : null}
                            <td className={tdMutedCell}>{r.perfil || '—'}</td>
                            <td className={`${tdRest} tabular-nums`}>
                                {formatCop(r.tarifaCliente)}
                                {r.moneda ? <span className={`ml-1 text-xs ${labelMuted}`}>{r.moneda}</span> : null}
                            </td>
                            <td className={tdRest}>
                                {r.novedadesCount > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => onVerDetalle(r)}
                                        className="text-sm font-semibold text-[#65BCF7] underline-offset-2 hover:underline"
                                    >
                                        {r.novedadesCount} aprobadas
                                    </button>
                                ) : (
                                    <span className={dash.tdMuted}>0</span>
                                )}
                            </td>
                            <td className={`${tdRest} tabular-nums`}>{formatCop(r.novedadesSumCop)}</td>
                            <td className={`${tdRest} tabular-nums`}>
                                {onFacturar ? (
                                    <button
                                        type="button"
                                        onClick={() => onFacturar(r)}
                                        className="flex items-center gap-1.5 font-semibold text-[#1fc76a] underline-offset-2 hover:underline"
                                        title={r.cerrado ? 'Editar facturación' : 'Cerrar facturación'}
                                    >
                                        {formatCop(r.facturaCop)}
                                    </button>
                                ) : (
                                    <span className={`font-semibold ${headingAccent}`}>{formatCop(r.facturaCop)}</span>
                                )}
                            </td>
                            <td className={tdPad || 'p-4'}>
                                {(() => {
                                    const est = r.estado || 'PENDIENTE';
                                    const badgeBase =
                                        'inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider';
                                    const styles = {
                                        PENDIENTE: isLight
                                            ? 'border-amber-300 bg-amber-100 text-amber-900'
                                            : 'border-amber-500/20 bg-amber-500/10 text-amber-400',
                                        ENVIADA: isLight
                                            ? 'border-blue-300 bg-blue-100 text-blue-900'
                                            : 'border-blue-500/20 bg-blue-500/10 text-blue-400',
                                        DEVUELTA: isLight
                                            ? 'border-rose-300 bg-rose-100 text-rose-900'
                                            : 'border-rose-500/20 bg-rose-500/10 text-rose-400',
                                        CONCILIADA: isLight
                                            ? 'border-cyan-300 bg-cyan-100 text-cyan-900'
                                            : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
                                        RADICADA: isLight
                                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                    };
                                    const labels = {
                                        PENDIENTE: 'Pendiente',
                                        ENVIADA: 'Enviada',
                                        DEVUELTA: 'Devuelta',
                                        CONCILIADA: 'Conciliada',
                                        RADICADA: 'Radicada'
                                    };
                                    return (
                                        <span className={`${badgeBase} ${styles[est] || styles.PENDIENTE}`}>
                                            {labels[est] || est}
                                        </span>
                                    );
                                })()}
                            </td>
                            <td className={tdActions}>
                                <div className="flex items-center justify-end gap-2">
                                    {onFacturar ? (
                                        <button type="button" onClick={() => onFacturar(r)} className={dash.actionBtn}>
                                            {r.cerrado ? 'Editar' : 'Facturar'}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={!r.novedadesCount}
                                        onClick={() => onVerDetalle(r)}
                                        className={`${dash.actionBtn} disabled:opacity-40`}
                                    >
                                        <Eye size={14} aria-hidden />
                                        Ver detalle
                                    </button>
                                </div>
                            </td>
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
