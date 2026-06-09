/**
 * Espejo frontend de src/novedadMonthlySplit.js (AUT-384) — solo helpers de preview UI.
 */

export const NOVEDAD_TYPES_MONTHLY_SPLIT_DISPLAY = new Set([
    'Incapacidad',
    'Licencia de luto',
    'Licencia de paternidad',
    'Licencia de maternidad',
    'Licencia remunerada',
    'Licencia no remunerada'
]);

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatYmdUtc(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function lastDayOfMonthYmd(year, month1to12) {
    const end = new Date(Date.UTC(year, month1to12, 0));
    return formatYmdUtc(end);
}

function ymdCompare(a, b) {
    if (!a || !b) return null;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

function parseYmdParts(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

export function crossesCalendarMonths(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) return false;
    return String(fechaInicio).slice(0, 7) !== String(fechaFin).slice(0, 7);
}

export function splitDateRangeByCalendarMonth(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) return [];
    if (!crossesCalendarMonths(fechaInicio, fechaFin)) return [];

    const segments = [];
    let cursor = fechaInicio;

    while (ymdCompare(cursor, fechaFin) <= 0) {
        const parts = parseYmdParts(cursor);
        if (!parts) break;
        const monthEnd = lastDayOfMonthYmd(parts.y, parts.mo);
        const segmentEnd = ymdCompare(monthEnd, fechaFin) <= 0 ? monthEnd : fechaFin;
        segments.push({ fechaInicio: cursor, fechaFin: segmentEnd });
        if (segmentEnd === fechaFin) break;
        const endParts = parseYmdParts(segmentEnd);
        if (!endParts) break;
        let nextY = endParts.y;
        let nextMo = endParts.mo + 1;
        if (nextMo > 12) {
            nextMo = 1;
            nextY += 1;
        }
        cursor = `${nextY}-${pad2(nextMo)}-01`;
    }

    const total = segments.length;
    return segments.map((seg, idx) => ({
        ...seg,
        segmentIndex: idx + 1,
        segmentTotal: total
    }));
}

export function previewMonthlySplitCount(tipoDisplay, fechaInicio, fechaFin) {
    if (!NOVEDAD_TYPES_MONTHLY_SPLIT_DISPLAY.has(String(tipoDisplay || '').trim())) return 0;
    if (!crossesCalendarMonths(fechaInicio, fechaFin)) return 0;
    return splitDateRangeByCalendarMonth(fechaInicio, fechaFin).length;
}
