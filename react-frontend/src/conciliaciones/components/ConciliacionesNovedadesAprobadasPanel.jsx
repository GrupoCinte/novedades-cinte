import { useMemo } from 'react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import {
    getNovedadImpactoFacturacion,
    computeFacturaLedgerTotal,
    resolveHorasBaseMes,
    computeValorHoraCop,
    computeMontoNovedadPreview,
    isNovedadCalculadaHoras,
    resolveCantidadHorasFacturacionPreview,
    showHorasDesgloseColumn,
    formatValorDesgloseCell,
    computeAdvanceDisplayTotals,
    formatSaldoAnticipoLabel,
    normalizeHorasInput
} from '../facturacionLogic.js';

function formatHoras(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    return x.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

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

function origenLabel(row) {
    if (row.cantidadHorasAjustado) return 'horas ajustadas';
    if (row.montoAjustado) return 'ajustado';
    if (row.montoOrigen === 'calculado' || row.montoCalculado) return 'calculado';
    if (row.montoOrigen === 'novedad') return 'desde novedad';
    return null;
}

function recalcMontoPreview(row, tarifa, horasBaseMes, cantidadHoras, hoursMode) {
    return computeMontoNovedadPreview(row, { tarifa, horasBaseMes, cantidadHoras, hoursMode });
}

function resolveCantidadHorasNovedad(row, id, { draftCantidadHorasNovedad, horasBaseMes }) {
    if (!isNovedadCalculadaHoras(row)) return null;
    const draft = draftCantidadHorasNovedad?.[id];
    if (draft != null && draft !== '') return normalizeHorasInput(draft);
    return resolveCantidadHorasFacturacionPreview(row, true, horasBaseMes);
}

function enrichItemHoras(row, hoursMode, horasBaseMes) {
    if (!hoursMode || !isNovedadCalculadaHoras(row)) return row;
    const horas = resolveCantidadHorasFacturacionPreview(row, true, horasBaseMes);
    return horas != null ? { ...row, cantidadHoras: horas } : row;
}

function HorasCell({ horas, dash, tdClass, inputCls, editable, onChange, ariaLabel }) {
    if (editable && onChange) {
        return (
            <td className={`${tdClass} tabular-nums text-right`}>
                <input
                    type="text"
                    inputMode="decimal"
                    className={inputCls}
                    value={horas ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={ariaLabel || 'Horas'}
                    placeholder="0"
                />
            </td>
        );
    }
    if (horas == null || !Number.isFinite(Number(horas)) || Number(horas) <= 0) {
        return <td className={`${tdClass} ${dash.tdMuted}`}>—</td>;
    }
    return (
        <td className={`${tdClass} tabular-nums text-right text-sm font-medium ${dash.tdLead}`}>
            {formatHoras(horas)} h
        </td>
    );
}

/** Tabla de novedades aprobadas (reutilizable embebida en revisión). */
export default function ConciliacionesNovedadesAprobadasPanel({
    items,
    loading,
    isLight,
    embedded = false,
    tarifaCliente = null,
    tarifaMaestro = null,
    tarifaAjustada = false,
    facturaCop = null,
    billingAdvanceMode = false,
    ajusteAnticipoMesLabel = null,
    saldoAnticipoTipo = null,
    ajusteAnticipoSumCop = 0,
    ajusteAnticipoSumaCop = 0,
    billingMode = null,
    baseHours = null,
    horasBaseMes = null,
    tarifaValorHora = null,
    editMode = false,
    draftTarifa = null,
    draftValorHora = null,
    draftCantidadHorasNovedad = {},
    draftMontos = {},
    onTarifaChange = null,
    onValorHoraChange = null,
    onCantidadHorasNovedadChange = null,
    onMontoChange = null
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const ledgerMode = tarifaCliente != null;

    const showHorasCol = showHorasDesgloseColumn({ billingMode, baseHours, horasBaseMes });
    const horasBase = resolveHorasBaseMes({ billingMode, baseHours, horasBaseMes });
    const editTarifaViaValorHora = showHorasCol && editMode && onValorHoraChange;

    const displayTarifa = editMode && draftTarifa != null ? Number(draftTarifa) : Number(tarifaCliente) || 0;
    const displayValorHora = useMemo(() => {
        if (editMode && draftValorHora != null && draftValorHora !== '') {
            return Number(draftValorHora);
        }
        if (tarifaValorHora != null && !editMode) return Number(tarifaValorHora);
        return computeValorHoraCop(displayTarifa, horasBase);
    }, [tarifaValorHora, displayTarifa, horasBase, editMode, draftValorHora]);

    const displayItems = useMemo(() => {
        const baseList = items || [];
        if (!editMode) {
            if (!showHorasCol) return baseList;
            return baseList.map((row) => enrichItemHoras(row, true, horasBase));
        }
        return baseList.map((row) => {
            const id = String(row.id || '');
            const cantidadHorasRow = resolveCantidadHorasNovedad(row, id, {
                draftCantidadHorasNovedad,
                horasBaseMes: horasBase
            });
            const usesHorasCalculo = showHorasCol && isNovedadCalculadaHoras(row);
            if (id && draftMontos[id] != null && draftMontos[id] !== '' && !usesHorasCalculo) {
                return { ...row, montoCop: Number(draftMontos[id]) };
            }
            const recalc = recalcMontoPreview(
                row,
                displayTarifa,
                horasBase,
                cantidadHorasRow,
                showHorasCol
            );
            if (recalc !== row.montoCop || cantidadHorasRow != null) {
                return {
                    ...row,
                    montoCop: recalc,
                    cantidadHoras: cantidadHorasRow ?? row.cantidadHoras
                };
            }
            return row;
        });
    }, [
        items,
        editMode,
        draftMontos,
        draftCantidadHorasNovedad,
        displayTarifa,
        horasBase,
        showHorasCol
    ]);

    const ledgerTotal = useMemo(() => {
        if (!ledgerMode) return null;
        return computeFacturaLedgerTotal(displayTarifa, displayItems, facturaCop, { billingAdvanceMode });
    }, [ledgerMode, displayTarifa, displayItems, facturaCop, billingAdvanceMode]);

    const advanceTotals = useMemo(
        () =>
            computeAdvanceDisplayTotals({
                billingAdvanceMode,
                ajusteAnticipoSumCop,
                ajusteAnticipoSumaCop,
                saldoAnticipoTipo,
                ajusteAnticipoMesLabel
            }),
        [
            billingAdvanceMode,
            ajusteAnticipoSumCop,
            ajusteAnticipoSumaCop,
            saldoAnticipoTipo,
            ajusteAnticipoMesLabel
        ]
    );

    const { currentItems, adjustmentItems } = useMemo(() => {
        if (!billingAdvanceMode) {
            return { currentItems: displayItems || [], adjustmentItems: [] };
        }
        const current = [];
        const adjustment = [];
        for (const row of displayItems || []) {
            if (row.scope === 'ajuste_anticipo') adjustment.push(row);
            else current.push(row);
        }
        return { currentItems: current, adjustmentItems: adjustment };
    }, [displayItems, billingAdvanceMode]);

    const renderNovedadRow = (row) => {
        const impacto = getNovedadImpactoFacturacion(row.tipoNovedad, row);
        const id = String(row.id || '');
        const usesHorasCalculo = showHorasCol && isNovedadCalculadaHoras(row);
        const cantidadHorasRow = resolveCantidadHorasNovedad(row, id, {
            draftCantidadHorasNovedad,
            horasBaseMes: horasBase
        });
        const montoDisplay =
            editMode && !usesHorasCalculo && draftMontos[id] != null
                ? Number(draftMontos[id])
                : row.montoCop != null
                  ? Number(row.montoCop)
                  : null;
        const cantidadLabel = formatCantidadImpacto(row);
        const origen = origenLabel(row);
        const montoLabel =
            montoDisplay != null && Number.isFinite(montoDisplay) && montoDisplay !== 0
                ? `${impacto === 'suma' ? '+' : '−'} ${formatCop(Math.abs(montoDisplay))}`
                : '—';
        const editCantidadHoras = editMode && usesHorasCalculo && onCantidadHorasNovedadChange;
        const rawHorasDraft = draftCantidadHorasNovedad?.[id];
        const horasCellValue = editCantidadHoras
            ? rawHorasDraft != null
                ? rawHorasDraft
                : (cantidadHorasRow ?? '')
            : cantidadHorasRow;
        const infoOnly = billingAdvanceMode && row.scope === 'periodo_actual';

        return (
            <tr key={row.id} className={dash.trHover}>
                <td className="p-1.5">
                    <div
                        className={`rounded-md border-l-4 px-2.5 py-2 ${impactRowClasses(impacto, isLight)}`}
                    >
                        <span className={`text-sm font-medium ${dash.tdLead}`}>{row.tipoNovedad}</span>
                        {(cantidadLabel || origen || infoOnly) ? (
                            <span className={`mt-0.5 block text-[10px] ${dash.modalMuted}`}>
                                {[cantidadLabel, origen, infoOnly ? 'liquidación mes siguiente' : null]
                                    .filter(Boolean)
                                    .join(' · ')}
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
                {showHorasCol ? (
                    <HorasCell
                        horas={horasCellValue}
                        dash={dash}
                        tdClass={tdHoras}
                        inputCls={inputCls}
                        editable={editCantidadHoras}
                        onChange={(val) => onCantidadHorasNovedadChange(id, val)}
                        ariaLabel={`Horas ${row.tipoNovedad}`}
                    />
                ) : null}
                <td
                    className={`${tdMonto} align-middle ${
                        infoOnly ? dash.tdMuted : impactMontoClasses(impacto)
                    }`}
                >
                    {editMode && onMontoChange && !usesHorasCalculo && !infoOnly ? (
                        <input
                            type="number"
                            min="0"
                            step="1"
                            className={inputCls}
                            value={montoDisplay ?? ''}
                            onChange={(e) => onMontoChange(id, e.target.value)}
                            aria-label={`Monto ${row.tipoNovedad}`}
                        />
                    ) : infoOnly ? (
                        <span className="text-xs">{montoLabel} (info)</span>
                    ) : (
                        montoLabel
                    )}
                </td>
            </tr>
        );
    };

    const thHoras = 'px-3 py-2 text-right font-heading text-[10px] font-bold uppercase tracking-wide w-[7.5rem] min-w-[7.5rem]';
    const tdHoras = `${dash.tdCell} align-middle w-[7.5rem] min-w-[7.5rem]`;
    const thMonto = 'px-3 py-2 text-right font-heading text-[10px] font-bold uppercase tracking-wide w-[9.5rem] min-w-[9.5rem]';
    const tdMonto = `${dash.tdCell} tabular-nums text-right font-semibold w-[9.5rem] min-w-[9.5rem]`;
    const inputCls = isLight
        ? 'w-full max-w-[8.5rem] rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums'
        : 'w-full max-w-[8.5rem] rounded border border-slate-600 bg-slate-900 px-2 py-1 text-right text-sm tabular-nums text-slate-100';

    const colSpanEmpty = showHorasCol ? 5 : 4;
    const tableMinW = showHorasCol ? 'min-w-[780px]' : 'min-w-[640px]';

    const tarifaValorHoraCell = formatValorDesgloseCell({
        medida: 'tarifa',
        tarifaValorHora: displayValorHora
    });

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
                        <table className={`w-full ${tableMinW} text-left text-sm`}>
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
                                    {showHorasCol ? (
                                        <th className={thHoras}>Horas</th>
                                    ) : null}
                                    <th className={thMonto}>{ledgerMode ? 'Monto (mes)' : 'Monto'}</th>
                                </tr>
                            </thead>
                            <tbody className={dash.tbody}>
                                {ledgerMode ? (
                                    <tr className={isLight ? 'bg-slate-50/90' : 'bg-slate-800/40'}>
                                        <td className={`${dash.tdCell} font-semibold`}>
                                            Tarifa Cliente
                                            {tarifaAjustada && !editMode ? (
                                                <span className={`mt-0.5 block text-[10px] font-normal ${dash.modalMuted}`}>
                                                    ajustado · maestro {formatCop(tarifaMaestro)}
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className={dash.tdMuted}>—</td>
                                        <td className={dash.tdMuted}>—</td>
                                        {showHorasCol ? (
                                            <td className={`${tdHoras} align-middle`}>
                                                {editTarifaViaValorHora ? (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        className={inputCls}
                                                        value={tarifaValorHoraCell ?? displayValorHora ?? ''}
                                                        onChange={(e) => onValorHoraChange(e.target.value)}
                                                        aria-label="Valor hora tarifa cliente"
                                                        title="Valor hora de la tarifa"
                                                    />
                                                ) : tarifaValorHoraCell != null ? (
                                                    <span className={`text-sm font-medium tabular-nums ${dash.tdLead}`}>
                                                        {formatCop(tarifaValorHoraCell)}
                                                    </span>
                                                ) : (
                                                    <span className={dash.tdMuted}>—</span>
                                                )}
                                                <span className={`mt-0.5 block text-[9px] ${dash.modalMuted}`}>
                                                    valor hora
                                                </span>
                                            </td>
                                        ) : null}
                                        <td className={`${tdMonto} ${dash.titleLg}`}>
                                            {editMode && onTarifaChange && !editTarifaViaValorHora ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    className={inputCls}
                                                    value={displayTarifa}
                                                    onChange={(e) => onTarifaChange(e.target.value)}
                                                    aria-label="Tarifa cliente"
                                                />
                                            ) : (
                                                formatCop(displayTarifa)
                                            )}
                                        </td>
                                    </tr>
                                ) : null}

                                {billingAdvanceMode ? (
                                    <>
                                        {adjustmentItems.length ? (
                                            <>
                                                <tr className={isLight ? 'bg-slate-50/90' : 'bg-slate-800/40'}>
                                                    <td
                                                        colSpan={colSpanEmpty}
                                                        className={`px-3 py-2 text-xs font-semibold ${dash.titleLg}`}
                                                    >
                                                        Ajuste mes anticipado
                                                        {advanceTotals.ajusteAnticipoMesLabel
                                                            ? ` (${advanceTotals.ajusteAnticipoMesLabel})`
                                                            : ''}
                                                        {advanceTotals.saldoAnticipoTipo ? (
                                                            <span
                                                                className={`ml-2 font-bold uppercase ${
                                                                    advanceTotals.saldoAnticipoTipo === 'favor'
                                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                                        : 'text-amber-600 dark:text-amber-400'
                                                                }`}
                                                            >
                                                                {formatSaldoAnticipoLabel(
                                                                    advanceTotals.saldoAnticipoTipo,
                                                                    null
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                </tr>
                                                {adjustmentItems.map(renderNovedadRow)}
                                            </>
                                        ) : null}
                                        {currentItems.length ? (
                                            <>
                                                <tr className={isLight ? 'bg-slate-50/90' : 'bg-slate-800/40'}>
                                                    <td
                                                        colSpan={colSpanEmpty}
                                                        className={`px-3 py-2 text-xs font-semibold ${dash.titleLg}`}
                                                    >
                                                        Novedades del mes (liquidación mes siguiente)
                                                    </td>
                                                </tr>
                                                {currentItems.map(renderNovedadRow)}
                                            </>
                                        ) : null}
                                    </>
                                ) : (
                                    (displayItems || []).map(renderNovedadRow)
                                )}

                                {ledgerMode && !items?.length ? (
                                    <tr>
                                        <td colSpan={colSpanEmpty} className={`px-3 py-2 text-xs ${dash.modalMuted}`}>
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
                                        {showHorasCol ? <td className={`${tdHoras} ${dash.tdMuted}`}>—</td> : null}
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
