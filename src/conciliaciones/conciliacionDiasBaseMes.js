'use strict';

const DIAS_MES_FACTURACION = 30;

function countBusinessDaysInMonth(year, month, festivosSet) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 0;
    const daysInMonth = new Date(y, m, 0).getDate();
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
    const y = Number(year);
    const m = Number(month);
    const calendarDaysInMonth =
        Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12
            ? new Date(y, m, 0).getDate()
            : DIAS_MES_FACTURACION;
    if (mode === 'CALENDAR_DAYS') {
        return {
            diasBaseMes: calendarDaysInMonth,
            diasBaseLabel: 'Días calendario del mes',
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
    countBusinessDaysInMonth,
    resolveDiasBaseMes
};
