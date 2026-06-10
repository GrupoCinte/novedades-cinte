/**
 * AUT-384: división de rangos de Incapacidad y licencias por mes calendario al radicar.
 */

const NOVEDAD_TYPES_MONTHLY_SPLIT = new Set([
    'incapacidad',
    'licencia_luto',
    'licencia_paternidad',
    'licencia_maternidad',
    'licencia_remunerada',
    'licencia_no_remunerada'
]);

const LICENCIA_TYPES_BUSINESS_DAYS = new Set([
    'licencia_luto',
    'licencia_paternidad',
    'licencia_maternidad',
    'licencia_remunerada',
    'licencia_no_remunerada'
]);

function parseYmdParts(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, mo, d };
}

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

function isValidYmdRange(fi, ff) {
    const cmp = ymdCompare(fi, ff);
    return cmp != null && cmp <= 0;
}

function monthKeyFromYmd(ymd) {
    return String(ymd || '').slice(0, 7);
}

function crossesCalendarMonths(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin) return false;
    if (!isValidYmdRange(fechaInicio, fechaFin)) return false;
    return monthKeyFromYmd(fechaInicio) !== monthKeyFromYmd(fechaFin);
}

function shouldSplitNovedadByCalendarMonth(novedadTypeKey, fechaInicio, fechaFin) {
    const key = String(novedadTypeKey || '').trim();
    if (!NOVEDAD_TYPES_MONTHLY_SPLIT.has(key)) return false;
    return crossesCalendarMonths(fechaInicio, fechaFin);
}

/**
 * @returns {Array<{ fechaInicio: string, fechaFin: string, segmentIndex: number, segmentTotal: number }>}
 */
function splitDateRangeByCalendarMonth(fechaInicio, fechaFin) {
    if (!isValidYmdRange(fechaInicio, fechaFin)) return [];
    if (!crossesCalendarMonths(fechaInicio, fechaFin)) return [];

    const segments = [];
    let cursor = fechaInicio;

    while (ymdCompare(cursor, fechaFin) <= 0) {
        const parts = parseYmdParts(cursor);
        if (!parts) break;
        const monthEnd = lastDayOfMonthYmd(parts.y, parts.mo);
        const segmentEnd = ymdCompare(monthEnd, fechaFin) <= 0 ? monthEnd : fechaFin;
        segments.push({
            fechaInicio: cursor,
            fechaFin: segmentEnd
        });

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

function computeSegmentCantidadHoras(novedadTypeKey, fechaInicio, fechaFin, deps = {}) {
    const key = String(novedadTypeKey || '').trim();
    const countCalendar = deps.countCalendarDaysInclusive;
    const countBusiness = deps.countBusinessDaysInclusive;
    const festivosSet = deps.festivosSet || new Set();

    if (key === 'incapacidad' && typeof countCalendar === 'function') {
        return countCalendar(fechaInicio, fechaFin);
    }
    if (LICENCIA_TYPES_BUSINESS_DAYS.has(key) && typeof countBusiness === 'function') {
        return countBusiness(fechaInicio, fechaFin, festivosSet);
    }
    if (typeof countCalendar === 'function') {
        return countCalendar(fechaInicio, fechaFin);
    }
    return 0;
}

function buildSegmentObservacion(baseObs, segmentIndex, segmentTotal, originalFi, originalFf) {
    const suffix = `Segmento ${segmentIndex}/${segmentTotal} (radicación original ${originalFi} — ${originalFf})`;
    const base = baseObs != null ? String(baseObs).trim() : '';
    if (!base) return suffix;
    return `${base}\n${suffix}`;
}

module.exports = {
    NOVEDAD_TYPES_MONTHLY_SPLIT,
    LICENCIA_TYPES_BUSINESS_DAYS,
    crossesCalendarMonths,
    shouldSplitNovedadByCalendarMonth,
    splitDateRangeByCalendarMonth,
    computeSegmentCantidadHoras,
    buildSegmentObservacion,
    lastDayOfMonthYmd,
    monthKeyFromYmd
};
