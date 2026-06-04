/**
 * Utilidades de fecha para migración pipeline Excel → reubicaciones.
 */

const EXCEL_UNIX_OFFSET = 25570;

function parseFechaFinCell(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const ms = (Math.round(raw) - EXCEL_UNIX_OFFSET) * 86400000;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
}

function dateToSqlDate(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

module.exports = { parseFechaFinCell, dateToSqlDate };
