'use strict';

/**
 * Parseo de fecha/hora de novedades alineado con prorrateo HE (sufijo Z en ISO).
 */
function toUtcMsFromDateAndTime(dateRaw, timeRaw) {
    let datePart = '';
    if (dateRaw instanceof Date) {
        datePart = dateRaw.toISOString().slice(0, 10);
    } else {
        const raw = String(dateRaw || '').trim();
        datePart = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
    }
    const timePart = String(timeRaw || '').slice(0, 8);
    if (!datePart || !timePart) return null;
    const ms = Date.parse(`${datePart}T${timePart}Z`);
    return Number.isNaN(ms) ? null : ms;
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
