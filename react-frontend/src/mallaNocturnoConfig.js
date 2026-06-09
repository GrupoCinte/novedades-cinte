/** Espejo ligero de src/directorio/mallaNocturnoConfig.js para preview en UI. */

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

export function computeShiftHours(horaInicio, horaFin) {
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
