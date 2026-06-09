/** Espejo ligero de src/directorio/mallaNocturnoConfig.js para preview en UI. */

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const NOCTURNO_EVENING_MIN = 18 * 60;
const NOCTURNO_MORNING_MAX = 6 * 60;
const NOCTURNO_MAX_HORAS = 12;

export const NOCTURNO_HORA_MIN = '18:00';
export const NOCTURNO_HORA_MAX = '06:00';

/** Mismas franjas para inicio y fin: 18–23 y 00–06 (24 h). */
export const NOCTURNO_HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

export const DEFAULT_NOCTURNO_CONFIG = {
    horaInicio: '22:00',
    horaFin: '06:00',
    cantidadHoras: 8,
    label: '22:00–06:00 (8 h)'
};

export function parseHhMm(value) {
    const s = String(value || '').trim();
    const m = HH_MM_RE.exec(s);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
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

export function nocturnoMinutesForHour(hour) {
    if (hour === 6) return [0];
    return Array.from({ length: 60 }, (_, i) => i);
}

export function clampNocturnoHhMm(value, fallback = DEFAULT_NOCTURNO_CONFIG.horaInicio) {
    const parsed = parseHhMm(value);
    if (parsed === null || !isNocturnoTime(parsed)) return fallback;
    const h = Math.floor(parsed / 60);
    const m = parsed % 60;
    if (!NOCTURNO_HOURS.includes(h)) return fallback;
    if (h === 6 && m > 0) return NOCTURNO_HORA_MAX;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeShiftHours(horaInicio, horaFin) {
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

export function validateNocturnoShiftTimes(horaInicio, horaFin) {
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

export function previewNocturnoHours(horaInicio, horaFin) {
    const v = validateNocturnoShiftTimes(horaInicio, horaFin);
    return v.ok ? v.cantidadHoras : null;
}

export function formatCantidadHoras(hours) {
    if (hours == null || Number.isNaN(hours)) return '—';
    return hours % 1 === 0 ? `${Math.round(hours)} h` : `${hours} h`;
}

export function nocturnoFranjaFromConfig(config) {
    const c = config || DEFAULT_NOCTURNO_CONFIG;
    return [
        {
            id: '22_06',
            label: c.label,
            horaInicio: c.horaInicio,
            horaFin: c.horaFin,
            cantidadHoras: c.cantidadHoras
        }
    ];
}
