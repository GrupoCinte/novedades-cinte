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
        nocturnoFranjaDefFromHorario(c.horaInicio, c.horaFin, c.cantidadHoras)
    ];
}

/** Id virtual UI: una banda horaria dentro de la franja API `22_06`. */
export function nocturnoVirtualFranjaId(horaInicio, horaFin) {
    return `22_06@${horaInicio}@${horaFin}`;
}

/** Resuelve id virtual nocturno o id de malla (`06_14`, …) hacia franja API + horario. */
export function parseNocturnoVirtualFranjaId(id) {
    const s = String(id || '');
    if (!s.startsWith('22_06@')) {
        return { apiFranja: s, horaInicio: null, horaFin: null };
    }
    const parts = s.split('@');
    return { apiFranja: '22_06', horaInicio: parts[1], horaFin: parts[2] };
}

export function resolveNocturnoHorarioPair(horaInicio, horaFin) {
    return {
        horaInicio: horaInicio ? String(horaInicio).slice(0, 5) : DEFAULT_NOCTURNO_CONFIG.horaInicio,
        horaFin: horaFin ? String(horaFin).slice(0, 5) : DEFAULT_NOCTURNO_CONFIG.horaFin
    };
}

export function nocturnoFranjaDefFromHorario(horaInicio, horaFin, cantidadHoras = null) {
    const hours = cantidadHoras ?? previewNocturnoHours(horaInicio, horaFin);
    return {
        id: nocturnoVirtualFranjaId(horaInicio, horaFin),
        horaInicio,
        horaFin,
        cantidadHoras: hours,
        label:
            hours != null
                ? `${horaInicio}–${horaFin} (${formatCantidadHoras(hours)})`
                : `${horaInicio}–${horaFin}`
    };
}

/** Franjas horarias presentes en una fila del mesh (solo bandas con asignados). */
export function nocturnoFranjasFromMeshRow(row) {
    if (!row || typeof row !== 'object') return [];
    return Object.keys(row)
        .filter((id) => id.startsWith('22_06@') && (row[id] || []).length > 0)
        .map((id) => {
            const { horaInicio, horaFin } = parseNocturnoVirtualFranjaId(id);
            return nocturnoFranjaDefFromHorario(horaInicio, horaFin);
        })
        .sort(
            (a, b) =>
                a.horaInicio.localeCompare(b.horaInicio) || a.horaFin.localeCompare(b.horaFin)
        );
}

/** Convierte id de UI (virtual nocturno o franja malla) al payload PUT /mallas-turnos. */
export function buildMallaTurnoPatch(virtualFranjaId, patchBase) {
    const { apiFranja, horaInicio, horaFin } = parseNocturnoVirtualFranjaId(virtualFranjaId);
    const patch = { ...patchBase, franja: apiFranja };
    if (apiFranja === '22_06' && horaInicio && horaFin) {
        patch.horaInicio = horaInicio;
        patch.horaFin = horaFin;
    }
    return patch;
}

export { NOCTURNO_MAX_HORAS };
