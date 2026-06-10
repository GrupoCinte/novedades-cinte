import * as nocturnoCore from './mallaNocturnoCore.js';

const {
    parseHhMm,
    computeShiftHours,
    validateShiftTimes,
    isNocturnoTime,
    DEFAULT_HORA_INICIO,
    DEFAULT_HORA_FIN,
    NOCTURNO_MAX_HORAS
} = nocturnoCore;

export { parseHhMm, computeShiftHours };

export const NOCTURNO_HORA_MIN = '18:00';
export const NOCTURNO_HORA_MAX = '06:00';

/** Mismas franjas para inicio y fin: 18–23 y 00–06 (24 h). */
export const NOCTURNO_HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

export const DEFAULT_NOCTURNO_CONFIG = {
    horaInicio: DEFAULT_HORA_INICIO,
    horaFin: DEFAULT_HORA_FIN,
    cantidadHoras: 8,
    label: '22:00–06:00 (8 h)'
};

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

export function validateNocturnoShiftTimes(horaInicio, horaFin) {
    return validateShiftTimes(horaInicio, horaFin);
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

export { NOCTURNO_MAX_HORAS };
