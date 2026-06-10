const {
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
} = require('../mallaNocturnoCore');

function normalizeTimeFromDb(value, fallback = DEFAULT_HORA_INICIO) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    const s = String(value || '').trim();
    if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
    return fallback;
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

/** Lectura desde BD: si el registro guardado no cumple la ventana nocturna, devuelve defaults. */
function buildConfigPayloadFromDb(horaInicio, horaFin) {
    const hi = normalizeTimeFromDb(horaInicio);
    const hf = normalizeTimeFromDb(horaFin, DEFAULT_HORA_FIN);
    const v = validateShiftTimes(hi, hf);
    if (v.ok) {
        return {
            horaInicio: hi,
            horaFin: hf,
            cantidadHoras: v.cantidadHoras,
            label: formatFranjaLabel(hi, hf, v.cantidadHoras),
            storedInvalid: false
        };
    }
    const fallback = buildConfigPayload(DEFAULT_HORA_INICIO, DEFAULT_HORA_FIN);
    return { ...fallback, storedInvalid: true, storedError: v.error };
}

function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/**
 * @param {string} fecha YYYY-MM-DD
 * @returns {{ fechaInicio: string, horaInicio: string, fechaFin: string, horaFin: string }}
 */
function resolveNocturnoDateTimeRange(fecha, horaInicio, horaFin) {
    const built = buildConfigPayload(horaInicio, horaFin);
    const start = parseHhMm(built.horaInicio);
    const end = parseHhMm(built.horaFin);
    if (start >= NOCTURNO_EVENING_MIN && end >= NOCTURNO_EVENING_MIN) {
        return {
            fechaInicio: fecha,
            horaInicio: built.horaInicio,
            fechaFin: fecha,
            horaFin: built.horaFin
        };
    }
    if (start <= NOCTURNO_MORNING_MAX && end <= NOCTURNO_MORNING_MAX) {
        return {
            fechaInicio: fecha,
            horaInicio: built.horaInicio,
            fechaFin: fecha,
            horaFin: built.horaFin
        };
    }
    return {
        fechaInicio: fecha,
        horaInicio: built.horaInicio,
        fechaFin: addDaysYmd(fecha, 1),
        horaFin: built.horaFin
    };
}

module.exports = {
    parseHhMm,
    computeShiftHours,
    formatFranjaLabel,
    validateShiftTimes,
    isNocturnoTime,
    normalizeTimeFromDb,
    buildConfigPayload,
    buildConfigPayloadFromDb,
    resolveNocturnoDateTimeRange,
    addDaysYmd,
    DEFAULT_HORA_INICIO,
    DEFAULT_HORA_FIN,
    NOCTURNO_EVENING_MIN,
    NOCTURNO_MORNING_MAX,
    NOCTURNO_MAX_HORAS
};
