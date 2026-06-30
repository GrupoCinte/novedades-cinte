'use strict';

const { shiftCalendarMonth } = require('./facturacionAggregate');
const {
    resolveEffectiveTarifa,
    resolveNovedadMontoConAjuste
} = require('./conciliacionAjustes');

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** @param {number} year @param {number} month 1-12 */
function monthRangeDates(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}

function isAdvanceMonthBilling(billingType) {
    return String(billingType || '').trim().toUpperCase() === 'ADVANCE_MONTH';
}

/**
 * @param {number} factYear
 * @param {number} factMonth
 * @returns {{ current: { year: number, month: number }, adjustment: { year: number, month: number } } | null}
 */
function resolveAdvancePeriods(factYear, factMonth) {
    const y = Number(factYear);
    const m = Number(factMonth);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    return {
        current: { year: y, month: m },
        adjustment: shiftCalendarMonth(y, m, -1)
    };
}

function effectiveNovedadDate(row) {
    const effectiveDate = row?.fecha_inicio ?? row?.fechaInicio ?? row?.fecha ?? row?.creado_en ?? row?.creadoEn;
    if (effectiveDate instanceof Date) return effectiveDate.toISOString().slice(0, 10);
    return String(effectiveDate || '').slice(0, 10);
}

/**
 * @param {object} row
 * @param {{ current: object, adjustment: object }} periods
 * @returns {'periodo_actual' | 'ajuste_anticipo' | null}
 */
function classifyNovedadAdvanceScope(row, periods) {
    if (!periods) return null;
    const eff = effectiveNovedadDate(row);
    if (!eff) return null;

    const mrCurrent = monthRangeDates(periods.current.year, periods.current.month);
    const mrAdj = monthRangeDates(periods.adjustment.year, periods.adjustment.month);
    if (!mrCurrent || !mrAdj) return null;

    if (eff >= mrAdj.start && eff <= mrAdj.end) return 'ajuste_anticipo';
    if (eff >= mrCurrent.start && eff <= mrCurrent.end) return 'periodo_actual';
    return null;
}

function splitNovedadesByAdvanceScope(novedadRows, periods) {
    const currentRows = [];
    const adjustmentRows = [];
    for (const row of novedadRows || []) {
        const scope = classifyNovedadAdvanceScope(row, periods);
        if (scope === 'periodo_actual') currentRows.push(row);
        else if (scope === 'ajuste_anticipo') adjustmentRows.push(row);
    }
    return { currentRows, adjustmentRows };
}

function aggregateScopeImpacto(tarifaMaestro, rows, ajustes, impactOptions = {}) {
    let sumSuma = 0;
    let sumResta = 0;
    let count = 0;
    for (const row of rows || []) {
        const r = resolveNovedadMontoConAjuste(tarifaMaestro, row, ajustes, impactOptions);
        count += 1;
        if (r.impacto === 'suma') sumSuma += r.montoCop;
        else sumResta += r.montoCop;
    }
    return { count, sumSuma, sumResta };
}

function resolveSaldoAnticipoTipo(sumSuma, sumResta) {
    const net = sumSuma - sumResta;
    if (net > 0) return 'contra';
    if (net < 0) return 'favor';
    return null;
}

function formatAdvanceMesLabel(year, month) {
    const m = Number(month);
    const y = Number(year);
    if (!Number.isFinite(m) || m < 1 || m > 12) return '';
    return `${MESES_CORTOS[m - 1]} ${y}`;
}

/**
 * ADVANCE: tarifa del mes + ajuste del mes anterior; novedades del mes actual no alteran factura.
 */
function aggregateAdvanceFactura(tarifaMaestro, novedadRows, ajustes, impactOptions = {}) {
    const effectiveTarifa = resolveEffectiveTarifa(tarifaMaestro, ajustes);
    const periods =
        impactOptions.periods ||
        resolveAdvancePeriods(impactOptions.factAnio ?? impactOptions.factYear, impactOptions.factMes ?? impactOptions.factMonth);

    const { currentRows, adjustmentRows } = splitNovedadesByAdvanceScope(novedadRows, periods);
    const adjImpact = aggregateScopeImpacto(tarifaMaestro, adjustmentRows, ajustes, impactOptions);

    const saldoAnticipoNetCop = adjImpact.sumSuma - adjImpact.sumResta;
    const saldoAnticipoTipo = resolveSaldoAnticipoTipo(adjImpact.sumSuma, adjImpact.sumResta);

    const facturaCop = effectiveTarifa + adjImpact.sumSuma - adjImpact.sumResta;
    const adjLabel = periods ? formatAdvanceMesLabel(periods.adjustment.year, periods.adjustment.month) : '';

    return {
        count: currentRows.length + adjImpact.count,
        countCurrent: currentRows.length,
        countAdjustment: adjImpact.count,
        novedadesSumCop: 0,
        novedadesSumaCop: 0,
        novedadesInfoCount: currentRows.length,
        pendingAdjustmentCount: currentRows.length,
        ajusteAnticipoSumCop: adjImpact.sumResta,
        ajusteAnticipoSumaCop: adjImpact.sumSuma,
        saldoAnticipoNetCop,
        saldoAnticipoTipo,
        ajusteAnticipoMesLabel: adjLabel,
        facturaCop,
        tarifaCliente: effectiveTarifa,
        tarifaMaestro: Math.round(Number(tarifaMaestro) || 0),
        tarifaAjustada: ajustes?.tarifaOverride != null,
        billingAdvanceMode: true,
        currentRows,
        adjustmentRows
    };
}

/** Omitir consumo cuando solo hay novedades del mes actual (se liquidan en el cierre siguiente). */
function shouldSkipAdvanceConsumo(billingType, novedadRows, factYear, factMonth) {
    if (!isAdvanceMonthBilling(billingType)) return false;
    const periods = resolveAdvancePeriods(factYear, factMonth);
    if (!periods) return true;
    const { adjustmentRows } = splitNovedadesByAdvanceScope(novedadRows, periods);
    return adjustmentRows.length === 0;
}

function emptyAdvanceFields() {
    return {
        ajusteAnticipoSumCop: 0,
        ajusteAnticipoSumaCop: 0,
        saldoAnticipoNetCop: 0,
        saldoAnticipoTipo: null,
        ajusteAnticipoMesLabel: null,
        novedadesCountAjuste: 0,
        billingAdvanceMode: false,
        novedadesInfoCount: 0,
        pendingAdjustmentCount: 0
    };
}

module.exports = {
    isAdvanceMonthBilling,
    resolveAdvancePeriods,
    effectiveNovedadDate,
    classifyNovedadAdvanceScope,
    splitNovedadesByAdvanceScope,
    aggregateAdvanceFactura,
    shouldSkipAdvanceConsumo,
    formatAdvanceMesLabel,
    resolveSaldoAnticipoTipo,
    emptyAdvanceFields
};
