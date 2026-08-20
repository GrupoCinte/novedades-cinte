'use strict';

const DIAS_MES_FACTURACION = 30;

function diasCalendarioMes(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return DIAS_MES_FACTURACION;
    return new Date(y, m, 0).getDate();
}

/** Días del mes para cobro: tope 30. Febrero sigue 28/29. */
function diasComercialMes(year, month) {
    return Math.min(diasCalendarioMes(year, month), DIAS_MES_FACTURACION);
}

function ultimoDiaComercialMes(year, month) {
    return diasComercialMes(year, month);
}

function mesComercialBounds(year, month) {
    const y = Number(year);
    const m = Number(month);
    const last = ultimoDiaComercialMes(y, m);
    const mm = String(m).padStart(2, '0');
    return {
        periodStart: `${y}-${mm}-01`,
        periodEnd: `${y}-${mm}-${String(last).padStart(2, '0')}`,
        daysInMonth: last
    };
}

function clipRangoAMesComercial(fechaInicio, fechaFin, year, month) {
    const fi = fechaInicio ? String(fechaInicio).slice(0, 10) : '';
    if (!fi) return null;
    const ff = fechaFin ? String(fechaFin).slice(0, 10) : fi;
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return { start: fi, end: ff };
    }
    const { periodStart, periodEnd } = mesComercialBounds(y, m);
    const start = fi > periodStart ? fi : periodStart;
    const end = ff < periodEnd ? ff : periodEnd;
    if (start > end) return null;
    return { start, end };
}

function countBusinessDaysInMonth(year, month, festivosSet) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 0;
    const daysInMonth = diasCalendarioMes(y, m);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
        const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = new Date(`${ymd}T12:00:00`).getDay();
        if (dow === 0 || dow === 6) continue;
        if (festivosSet && typeof festivosSet.has === 'function' && festivosSet.has(ymd)) continue;
        count += 1;
    }
    return count;
}

/**
 * Días base de referencia para el mes de facturación según billingMode del servicio.
 * @param {{ billingMode?: string, year: number, month: number, festivosSet?: Set<string>|null }} opts
 */
function resolveDiasBaseMes({ billingMode, year, month, festivosSet = null }) {
    const mode = String(billingMode || '').trim().toUpperCase();
    if (mode === 'CALENDAR_DAYS') {
        return {
            diasBaseMes: diasComercialMes(year, month),
            diasBaseLabel: 'Días del mes',
            festivosAplicados: false
        };
    }
    if (mode === 'BUSINESS_DAYS') {
        const festivosOk = festivosSet && typeof festivosSet.size === 'number' && festivosSet.size > 0;
        return {
            diasBaseMes: countBusinessDaysInMonth(year, month, festivosOk ? festivosSet : null),
            diasBaseLabel: 'Días hábiles del mes',
            festivosAplicados: Boolean(festivosOk)
        };
    }
    return { diasBaseMes: null, diasBaseLabel: null, festivosAplicados: false };
}

module.exports = {
    DIAS_MES_FACTURACION,
    diasCalendarioMes,
    diasComercialMes,
    ultimoDiaComercialMes,
    mesComercialBounds,
    clipRangoAMesComercial,
    countBusinessDaysInMonth,
    resolveDiasBaseMes
};
