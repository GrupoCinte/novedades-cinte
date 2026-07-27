'use strict';

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_HORA_INICIO = '22:00';
const DEFAULT_HORA_FIN = '06:00';

/** Ventana nocturna única: 18:00–23:59 y 00:00–06:00 (24 h). */
const NOCTURNO_EVENING_MIN = 18 * 60;
const NOCTURNO_MORNING_MAX = 6 * 60;
const NOCTURNO_MAX_HORAS = 12;

function parseHhMm(value) {
    const s = String(value || '').trim();
    const m = HH_MM_RE.exec(s);
    if (!m) return null;
    return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
}

function isNocturnoTime(minutes) {
    if (minutes == null) return false;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h >= 18) return true;
    if (h < 6) return true;
    if (h === 6) return m === 0;
    return false;
}

function computeShiftHours(horaInicio, horaFin) {
    const start = parseHhMm(horaInicio);
    const end = parseHhMm(horaFin);
    if (start === null || end === null || start === end) return null;
    if (!isNocturnoTime(start) || !isNocturnoTime(end)) return null;

    const eveningStart = start >= NOCTURNO_EVENING_MIN;
    const eveningEnd = end >= NOCTURNO_EVENING_MIN;
    const morningStart = start <= NOCTURNO_MORNING_MAX;
    const morningEnd = end <= NOCTURNO_MORNING_MAX;

    let minutes;
    if (eveningStart && eveningEnd) {
        if (end <= start) return null;
        minutes = end - start;
    } else if (morningStart && morningEnd) {
        if (end <= start) return null;
        minutes = end - start;
    } else if (eveningStart && morningEnd) {
        minutes = 24 * 60 - start + end;
    } else {
        return null;
    }
    return Number((minutes / 60).toFixed(2));
}

function formatFranjaLabel(horaInicio, horaFin, cantidadHoras) {
    const h =
        cantidadHoras % 1 === 0 ? String(Math.round(cantidadHoras)) : String(cantidadHoras);
    return `${horaInicio}–${horaFin} (${h} h)`;
}

function validateShiftTimes(horaInicio, horaFin) {
    const start = parseHhMm(horaInicio);
    const end = parseHhMm(horaFin);
    if (start === null || end === null) {
        return { ok: false, error: 'Horario inválido; use HH:mm (24 h).' };
    }
    if (!isNocturnoTime(start) || !isNocturnoTime(end)) {
        return { ok: false, error: 'Inicio y fin deben estar entre 18:00 y 06:00 (24 h).' };
    }
    if (start === end) {
        return { ok: false, error: 'Hora inicio y fin deben ser distintas.' };
    }
    const hours = computeShiftHours(horaInicio, horaFin);
    if (hours === null || hours <= 0 || hours > NOCTURNO_MAX_HORAS) {
        return {
            ok: false,
            error: `La duración nocturna debe ser mayor a 0 y hasta ${NOCTURNO_MAX_HORAS} horas.`
        };
    }
    return { ok: true, cantidadHoras: hours };
}

module.exports = {
    parseHhMm,
    computeShiftHours,
    formatFranjaLabel,
    validateShiftTimes,
    isNocturnoTime,
    DEFAULT_HORA_INICIO,
    DEFAULT_HORA_FIN,
    NOCTURNO_EVENING_MIN,
    NOCTURNO_MORNING_MAX,
    NOCTURNO_MAX_HORAS
};
