'use strict';

const { bogotaMidnightUtcMsFromYmd } = require('./heDomingoBogota');

const MAX_OFFSET_MS = 48 * 60 * 60 * 1000;

/**
 * `fecha` + `hora` se interpretan como **reloj civil America/Bogotá** (calendario y hora local),
 * no como UTC. Colombia no usa DST; medianoche Bogotá del día `YYYY-MM-DD` coincide con
 * `bogotaMidnightUtcMsFromYmd` en heDomingoBogota.
 *
 * Filas guardadas antes de este criterio podían haberse digitado pensando en UTC implícito (`...Z`);
 * alinear históricos requiere revisión manual o script dedicado.
 */
function parseTimeToMsFromMidnight(timeRaw) {
    const t = String(timeRaw || '').trim();
    const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(t);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    const s = Number(m[3] || 0);
    const off = ((h * 60 + mi) * 60 + s) * 1000;
    if (!Number.isFinite(off) || off < 0 || off >= MAX_OFFSET_MS) return null;
    return off;
}

/**
 * @param {string|Date} dateRaw YYYY-MM-DD civil Bogotá (o Date desde PG; se usa la fecha calendario UTC del instante)
 * @param {string} timeRaw HH:mm o HH:mm:ss civil Bogotá ese día
 * @returns {number|null} epoch ms UTC
 */
function toUtcMsFromDateAndTime(dateRaw, timeRaw) {
    let datePart = '';
    if (dateRaw instanceof Date) {
        datePart = dateRaw.toISOString().slice(0, 10);
    } else {
        const raw = String(dateRaw || '').trim();
        datePart = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
    }
    const timePart = String(timeRaw || '').trim();
    if (!datePart || !timePart) return null;
    const offset = parseTimeToMsFromMidnight(timePart);
    if (offset == null) return null;
    const day0 = bogotaMidnightUtcMsFromYmd(datePart);
    if (day0 == null) return null;
    return day0 + offset;
}

function resolveFallbackDateKeyFromRow(row) {
    if (row?.fecha_inicio instanceof Date) return row.fecha_inicio.toISOString().slice(0, 10);
    if (row?.creado_en instanceof Date) return row.creado_en.toISOString().slice(0, 10);
    const fechaInicioRaw = String(row?.fecha_inicio || '').trim();
    const creadoRaw = String(row?.creado_en || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(fechaInicioRaw)) return fechaInicioRaw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}/.test(creadoRaw)) return creadoRaw.slice(0, 10);
    return '';
}

module.exports = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
