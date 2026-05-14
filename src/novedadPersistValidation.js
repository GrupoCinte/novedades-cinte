'use strict';

const { normalizeNovedadTypeKey } = require('./rbac');

const ALLOWED_AREAS = new Set(['Global', 'Capital Humano', 'Operaciones']);
const ESTADOS = new Set(['Pendiente', 'Aprobado', 'Rechazado']);

function toYmd(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
}

function toHms(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const hh = String(value.getHours()).padStart(2, '0');
        const mm = String(value.getMinutes()).padStart(2, '0');
        const ss = String(value.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }
    const s = String(value).trim();
    if (!s) return null;
    const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!m) return null;
    const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
    const mm = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
    const ss = m[3] != null ? String(Math.min(59, Math.max(0, Number(m[3])))).padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
}

function nonNegNum(v, def = 0) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

/**
 * Valida una fila novedades ya fusionada (snake_case) para PATCH administrativo.
 * @param {object} merged
 * @param {{ toUtcMsFromDateAndTime: function }} opts
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateMergedNovedadForAdmin(merged, opts) {
    const { toUtcMsFromDateAndTime } = opts;
    const nombre = String(merged.nombre || '').trim();
    if (!nombre) return { ok: false, error: 'El nombre es obligatorio.' };

    const cedula = String(merged.cedula || '').trim();
    if (!cedula) return { ok: false, error: 'La cédula es obligatoria.' };

    const area = String(merged.area || '').trim();
    if (!ALLOWED_AREAS.has(area)) {
        return { ok: false, error: 'Área inválida. Use Global, Capital Humano u Operaciones.' };
    }

    const estado = String(merged.estado || '').trim();
    if (!ESTADOS.has(estado)) {
        return { ok: false, error: 'Estado inválido.' };
    }

    const tipoLabel = String(merged.tipo_novedad || '').trim();
    if (!tipoLabel) {
        return { ok: false, error: 'El tipo de novedad es obligatorio.' };
    }
    const tipoKey = normalizeNovedadTypeKey(tipoLabel) || null;

    const ymdStart = toYmd(merged.fecha_inicio);
    const ymdEnd = toYmd(merged.fecha_fin);
    const ymdFecha = toYmd(merged.fecha);

    if (tipoKey !== 'vacaciones_dinero' && !ymdStart) {
        return { ok: false, error: 'Fecha inicio es obligatoria.' };
    }
    if (ymdEnd && ymdStart && ymdEnd < ymdStart) {
        return { ok: false, error: 'Fecha fin no puede ser menor a fecha inicio.' };
    }

    const nums = [
        ['cantidad_horas', merged.cantidad_horas],
        ['horas_diurnas', merged.horas_diurnas],
        ['horas_nocturnas', merged.horas_nocturnas],
        ['horas_recargo_domingo', merged.horas_recargo_domingo],
        ['horas_recargo_domingo_diurnas', merged.horas_recargo_domingo_diurnas],
        ['horas_recargo_domingo_nocturnas', merged.horas_recargo_domingo_nocturnas]
    ];
    for (const [, val] of nums) {
        const n = nonNegNum(val, 0);
        if (n === null) return { ok: false, error: 'Las cantidades de horas deben ser números mayores o iguales a cero.' };
    }

    if (merged.monto_cop != null && merged.monto_cop !== '') {
        const m = Number(merged.monto_cop);
        if (!Number.isFinite(m) || m < 0) {
            return { ok: false, error: 'Monto COP inválido.' };
        }
    }

    if (tipoKey === 'hora_extra') {
        const hi = toHms(merged.hora_inicio);
        const hf = toHms(merged.hora_fin);
        const fi = ymdStart || ymdFecha;
        const ff = ymdEnd || fi;
        if (!hi || !hf || !fi || !ff) {
            return { ok: false, error: 'Hora Extra requiere fecha inicio/fin y hora inicio/fin.' };
        }
        const startMs = toUtcMsFromDateAndTime(fi, hi);
        const endMs = toUtcMsFromDateAndTime(ff, hf);
        const MAX_MS = 168 * 60 * 60 * 1000;
        if (startMs != null && endMs != null && Number.isFinite(endMs - startMs)) {
            if (endMs <= startMs) {
                return { ok: false, error: 'La fecha/hora fin debe ser mayor a la fecha/hora inicio.' };
            }
            if (endMs - startMs > MAX_MS) {
                return { ok: false, error: 'Hora Extra: el lapso no puede superar 168 horas (7 días).' };
            }
        } else {
            return { ok: false, error: 'No se pudo validar el rango de fecha/hora de Hora Extra.' };
        }
    }

    if (tipoKey === 'vacaciones_tiempo' && !ymdEnd) {
        return { ok: false, error: 'Vacaciones en tiempo requiere fecha fin.' };
    }

    const unidadNorm = merged.unidad != null && merged.unidad !== '' ? String(merged.unidad).trim().toLowerCase() : null;
    if (unidadNorm && !['dias', 'horas'].includes(unidadNorm)) {
        return { ok: false, error: 'Unidad inválida: use dias u horas.' };
    }

    return { ok: true };
}

module.exports = {
    validateMergedNovedadForAdmin,
    toYmd,
    toHms,
    nonNegNum,
    ALLOWED_AREAS,
    ESTADOS
};
