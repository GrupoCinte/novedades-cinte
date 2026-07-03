'use strict';

const { parseHeDomingoCompFromObservacion } = require('./heDomingoCompensacion');
const { splitHoursByBogotaDay, isSundayBogotaYmd } = require('./heDomingoBogota');
const { collectHeDiurnaNocturnaSegmentsBogota } = require('./heBogotaSplit');
const {
    HE_TIPO_CANONICO,
    formatHeTipoFromSliceKey,
    resolveHeTiposResumenDesdeHoras,
    mapLegacyTipoHoraExtraToCanonical
} = require('./novedadHeTipoCatalog');

/**
 * @typedef {{ sliceKey: string, tipoLabel: string, hours: number, columnKey: string }} HeExcelSlice
 */

const EPS_H = 0.06;

/**
 * Horas de HE «laboral» (exceso tras recargo dominical) en tramos diurno/nocturno que caen en domingo calendario Bogotá.
 * @param {{ fechaInicio?: string, fechaFin?: string, horaInicio?: string, horaFin?: string }} it
 * @param {{ toUtcMsFromDateAndTime: (d: unknown, t: unknown) => number|null }} dep
 * @returns {{ diurnaSun: number, nocturnaSun: number }}
 */
function heDiurnaNocturnaSundayHoursBogota(it, dep) {
    const toUtc = dep?.toUtcMsFromDateAndTime;
    if (typeof toUtc !== 'function') return { diurnaSun: 0, nocturnaSun: 0 };
    const fi = String(it?.fechaInicio || '').trim().slice(0, 10);
    const ff = String(it?.fechaFin || '').trim().slice(0, 10);
    const hi = String(it?.horaInicio || '').trim();
    const hf = String(it?.horaFin || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fi) || !/^\d{4}-\d{2}-\d{2}$/.test(ff) || !hi || !hf) {
        return { diurnaSun: 0, nocturnaSun: 0 };
    }
    const startMs = toUtc(fi, hi);
    const endMs = toUtc(ff, hf);
    if (startMs == null || endMs == null || !Number.isFinite(endMs - startMs) || endMs <= startMs) {
        return { diurnaSun: 0, nocturnaSun: 0 };
    }
    const { diurna, nocturna } = collectHeDiurnaNocturnaSegmentsBogota(startMs, endMs);
    let diurnaSun = 0;
    let nocturnaSun = 0;
    for (const seg of diurna) {
        for (const [dayKey, h] of splitHoursByBogotaDay(seg.startMs, seg.endMs)) {
            if (isSundayBogotaYmd(dayKey) && Number.isFinite(h) && h > 0) diurnaSun += h;
        }
    }
    for (const seg of nocturna) {
        for (const [dayKey, h] of splitHoursByBogotaDay(seg.startMs, seg.endMs)) {
            if (isSundayBogotaYmd(dayKey) && Number.isFinite(h) && h > 0) nocturnaSun += h;
        }
    }
    return { diurnaSun, nocturnaSun };
}

/**
 * Divide slice diurna/nocturna en filas laboral y/o dominical según horas en domingo Bogotá.
 * @param {'diurna'|'nocturna'} kind
 * @param {number} sliceH
 * @param {number} sunH
 * @param {string} columnKey
 * @param {string} observacion
 * @returns {HeExcelSlice[]}
 */
function buildHeLaboralDomingoSlices(kind, sliceH, sunH, columnKey, observacion) {
    const obs = String(observacion || '');
    /** @type {HeExcelSlice[]} */
    const out = [];
    const laboralKey = kind === 'diurna' ? 'diurna_laboral' : 'nocturna_laboral';
    const domKey = kind === 'diurna' ? 'diurna_dominical' : 'nocturna_dominical';
    const laboralPart = Math.max(0, sliceH - sunH);
    if (sunH <= EPS_H) {
        out.push({
            sliceKey: laboralKey,
            tipoLabel: formatHeTipoFromSliceKey(laboralKey, obs),
            hours: sliceH,
            columnKey
        });
        return out;
    }
    if (laboralPart <= EPS_H) {
        out.push({
            sliceKey: domKey,
            tipoLabel: formatHeTipoFromSliceKey(domKey, obs),
            hours: sliceH,
            columnKey
        });
        return out;
    }
    out.push({
        sliceKey: laboralKey,
        tipoLabel: formatHeTipoFromSliceKey(laboralKey, obs),
        hours: laboralPart,
        columnKey
    });
    out.push({
        sliceKey: domKey,
        tipoLabel: formatHeTipoFromSliceKey(domKey, obs),
        hours: sunH,
        columnKey
    });
    return out;
}

const SLICE_SPECS = [
    { sliceKey: 'diurna', columnKey: 'horasDiurnas', getter: (it) => Number(it?.horasDiurnas || 0) },
    { sliceKey: 'nocturna', columnKey: 'horasNocturnas', getter: (it) => Number(it?.horasNocturnas || 0) },
    {
        sliceKey: 'recargo_diurno',
        columnKey: 'horasRecargoDomingoDiurnas',
        getter: (it) => Number(it?.horasRecargoDomingoDiurnas || 0)
    },
    {
        sliceKey: 'recargo_nocturno_ordinario',
        columnKey: 'horasRecargoNocturno',
        getter: (it) => Number(it?.horasRecargoNocturno || 0)
    },
    {
        sliceKey: 'recargo_nocturno',
        columnKey: 'horasRecargoDomingoNocturnas',
        getter: (it) => Number(it?.horasRecargoDomingoNocturnas || 0)
    }
];

function hasLegacyRecargoSolo(it) {
    const r = Number(it?.horasRecargoDomingo || 0);
    const rdd = Number(it?.horasRecargoDomingoDiurnas || 0);
    const rdn = Number(it?.horasRecargoDomingoNocturnas || 0);
    return r > 0 && rdd === 0 && rdn === 0;
}

/**
 * Etiqueta legible para columna «Compensación dominical» en export Excel (por fila / slice).
 * @param {string} observacion he_domingo_observacion o equivalente cliente
 * @param {string} sliceKey
 * @returns {string}
 */
function compensacionDominicalExcelEtiqueta(observacion, sliceKey) {
    const p = parseHeDomingoCompFromObservacion(String(observacion || ''));
    const isRecargo =
        sliceKey === 'recargo_diurno' ||
        sliceKey === 'recargo_nocturno' ||
        sliceKey === 'recargo_legacy' ||
        sliceKey === 'diurna_dominical' ||
        sliceKey === 'nocturna_dominical';
    if (p) {
        if (p.mode === 'tiempo') return 'Compensado en tiempo';
        if (p.mode === 'dinero') return 'Compensado en dinero';
        if (p.mode === 'tercer_domingo') return 'Tercer domingo (política)';
    }
    if (isRecargo) return 'Sin compensación registrada';
    return 'No aplica (tramo no recargo dominical)';
}

/**
 * Tipo novedad canónico para una fila HE desagregada.
 * @param {object} it
 * @param {HeExcelSlice|string} sliceOrLabel slice completo o etiqueta precalculada
 * @returns {string}
 */
function formatTipoNovedadHeSlice(it, sliceOrLabel) {
    const obs = String(it?.heDomingoObservacion || '');
    if (sliceOrLabel && typeof sliceOrLabel === 'object') {
        if (sliceOrLabel.tipoLabel) return sliceOrLabel.tipoLabel;
        if (sliceOrLabel.sliceKey) return formatHeTipoFromSliceKey(sliceOrLabel.sliceKey, obs);
    }
    return String(sliceOrLabel || '').trim();
}

/**
 * @param {object} it objeto cliente toClientNovedad
 * @param {{ toUtcMsFromDateAndTime?: (d: unknown, t: unknown) => number|null }} [dep]
 * @returns {HeExcelSlice[]|null} null = usar fila única legacy (sin componentes > 0)
 */
function buildHoraExtraExportSlices(it, dep) {
    const obs = String(it?.heDomingoObservacion || '');
    const { diurnaSun, nocturnaSun } = heDiurnaNocturnaSundayHoursBogota(it, dep || {});
    /** @type {HeExcelSlice[]} */
    const out = [];
    for (const spec of SLICE_SPECS) {
        const h = spec.getter(it);
        if (h <= 0) continue;
        if (spec.sliceKey === 'diurna') {
            out.push(...buildHeLaboralDomingoSlices('diurna', h, diurnaSun, spec.columnKey, obs));
            continue;
        }
        if (spec.sliceKey === 'nocturna') {
            out.push(...buildHeLaboralDomingoSlices('nocturna', h, nocturnaSun, spec.columnKey, obs));
            continue;
        }
        out.push({
            sliceKey: spec.sliceKey,
            tipoLabel: formatHeTipoFromSliceKey(spec.sliceKey, obs),
            hours: h,
            columnKey: spec.columnKey
        });
    }
    if (hasLegacyRecargoSolo(it)) {
        out.push({
            sliceKey: 'recargo_legacy',
            tipoLabel: formatHeTipoFromSliceKey('recargo_legacy', obs),
            hours: Number(it.horasRecargoDomingo || 0),
            columnKey: 'horasRecargoDomingo'
        });
    }
    return out.length ? out : null;
}

/**
 * Tipo novedad para fila legacy HE (sin desglose por componentes).
 * @param {object} it
 * @returns {string}
 */
function formatTipoNovedadHeLegacy(it) {
    const tipo = String(it?.tipoNovedad || '').trim();
    const labels = resolveHeTiposResumenDesdeHoras(it);
    if (labels.length) return labels.join(', ');
    const legacy = mapLegacyTipoHoraExtraToCanonical(String(it?.tipoHoraExtra || '').trim());
    if (legacy.length) return legacy.join(', ');
    return tipo || HE_TIPO_CANONICO.HE_DIURNA;
}

module.exports = {
    buildHoraExtraExportSlices,
    compensacionDominicalExcelEtiqueta,
    formatTipoNovedadHeSlice,
    formatTipoNovedadHeLegacy,
    heDiurnaNocturnaSundayHoursBogota,
    buildHeLaboralDomingoSlices
};
