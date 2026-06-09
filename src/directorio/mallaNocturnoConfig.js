const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_HORA_INICIO = '22:00';
const DEFAULT_HORA_FIN = '06:00';

function parseHhMm(value) {
    const s = String(value || '').trim();
    const m = HH_MM_RE.exec(s);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function computeShiftHours(horaInicio, horaFin) {
    const start = parseHhMm(horaInicio);
    const end = parseHhMm(horaFin);
    if (start === null || end === null) return null;
    if (start === end) return null;
    let minutes;
    if (end <= start) {
        minutes = 24 * 60 - start + end;
    } else {
        minutes = end - start;
    }
    return Number((minutes / 60).toFixed(2));
}

function formatFranjaLabel(horaInicio, horaFin, cantidadHoras) {
    const h =
        cantidadHoras % 1 === 0 ? String(Math.round(cantidadHoras)) : String(cantidadHoras);
    return `${horaInicio}–${horaFin} (${h} h)`;
}

function validateShiftTimes(horaInicio, horaFin) {
    const hours = computeShiftHours(horaInicio, horaFin);
    if (hours === null) {
        return { ok: false, error: 'Horario inválido; use HH:mm y hora inicio distinta de fin.' };
    }
    if (hours <= 0 || hours > 24) {
        return { ok: false, error: 'La duración debe ser mayor a 0 y hasta 24 horas.' };
    }
    return { ok: true, cantidadHoras: hours };
}

function normalizeTimeFromDb(value) {
    const s = String(value || '').trim();
    if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
    return DEFAULT_HORA_INICIO;
}

function buildConfigPayload(horaInicio, horaFin) {
    const hi = String(horaInicio || '').trim().slice(0, 5);
    const hf = String(horaFin || '').trim().slice(0, 5);
    const v = validateShiftTimes(hi, hf);
    if (!v.ok) {
        throw Object.assign(new Error(v.error), { status: 400 });
    }
    return {
        horaInicio: hi,
        horaFin: hf,
        cantidadHoras: v.cantidadHoras,
        label: formatFranjaLabel(hi, hf, v.cantidadHoras)
    };
}

module.exports = {
    parseHhMm,
    computeShiftHours,
    formatFranjaLabel,
    validateShiftTimes,
    normalizeTimeFromDb,
    buildConfigPayload,
    DEFAULT_HORA_INICIO,
    DEFAULT_HORA_FIN
};
