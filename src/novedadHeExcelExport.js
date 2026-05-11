'use strict';

const { formatHeDomingoCompTipoSuffix, parseHeDomingoCompFromObservacion } = require('./heDomingoCompensacion');
const { splitHoursByBogotaDay, isSundayBogotaYmd } = require('./heDomingoBogota');
const { collectHeDiurnaNocturnaSegmentsBogota } = require('./heBogotaSplit');

/**
 * @typedef {{ sliceKey: string, tipoLabel: string, hours: number, columnKey: string }} HeExcelSlice
 */

const EPS_H = 0.06;

/**
 * Horas de HE «laboral» (exceso tras recargo dominical) en tramos diurno/nocturno que caen en domingo calendario Bogotá.
 * Sirve para etiquetar el Excel: antes solo «Recargo dominical …» llevaba «dominical».
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
 * @param {number} sliceH
 * @param {number} sunH
 * @param {'diurna'|'nocturna'} kind
 */
function excelTipoLabelHeLaboralConDomingo(sliceH, sunH, kind) {
    const base = kind === 'diurna' ? 'Hora Diurna' : 'Hora Nocturna';
    if (sunH <= EPS_H) return base;
    const laboralPart = Math.max(0, sliceH - sunH);
    if (laboralPart <= EPS_H) {
        return kind === 'diurna' ? 'Hora diurna dominical' : 'Hora nocturna dominical';
    }
    return kind === 'diurna' ? 'Hora diurna (dominical y laboral)' : 'Hora nocturna (dominical y laboral)';
}

const SLICE_SPECS = [
    { sliceKey: 'diurna', columnKey: 'horasDiurnas', tipoLabel: 'Hora Diurna', getter: (it) => Number(it?.horasDiurnas || 0) },
    { sliceKey: 'nocturna', columnKey: 'horasNocturnas', tipoLabel: 'Hora Nocturna', getter: (it) => Number(it?.horasNocturnas || 0) },
    {
        sliceKey: 'recargo_diurno',
        columnKey: 'horasRecargoDomingoDiurnas',
        tipoLabel: 'Recargo dominical diurno',
        getter: (it) => Number(it?.horasRecargoDomingoDiurnas || 0)
    },
    {
        sliceKey: 'recargo_nocturno',
        columnKey: 'horasRecargoDomingoNocturnas',
        tipoLabel: 'Recargo dominical nocturno',
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
 * @param {string} sliceKey diurna|nocturna|recargo_diurno|recargo_nocturno|recargo_legacy
 * @returns {string}
 */
function compensacionDominicalExcelEtiqueta(observacion, sliceKey) {
    const p = parseHeDomingoCompFromObservacion(String(observacion || ''));
    const isRecargo =
        sliceKey === 'recargo_diurno' || sliceKey === 'recargo_nocturno' || sliceKey === 'recargo_legacy';
    if (p) {
        if (p.mode === 'tiempo') return 'Compensado en tiempo';
        if (p.mode === 'dinero') return 'Compensado en dinero';
        if (p.mode === 'tercer_domingo') return 'Tercer domingo (política)';
    }
    if (isRecargo) return 'Sin compensación registrada';
    return 'No aplica (tramo no recargo dominical)';
}

/**
 * Tipo novedad para una sola tipología HE + sufijo dominical si aplica.
 */
function formatTipoNovedadHeSlice(it, singleTipoLabel) {
    const tipo = String(it?.tipoNovedad || '').trim();
    const base = singleTipoLabel ? `Hora Extra / ${singleTipoLabel}` : tipo || 'Hora Extra';
    const suf = formatHeDomingoCompTipoSuffix(String(it?.heDomingoObservacion || ''));
    return suf ? base + suf : base;
}

/**
 * @param {object} it objeto cliente toClientNovedad
 * @param {{ toUtcMsFromDateAndTime?: (d: unknown, t: unknown) => number|null }} [dep] si viene, enriquece etiquetas diurna/nocturna con «dominical» cuando el tramo HE cae en domingo Bogotá
 * @returns {HeExcelSlice[]|null} null = usar fila única legacy (sin componentes > 0)
 */
function buildHoraExtraExportSlices(it, dep) {
    const { diurnaSun, nocturnaSun } = heDiurnaNocturnaSundayHoursBogota(it, dep || {});
    /** @type {HeExcelSlice[]} */
    const out = [];
    for (const spec of SLICE_SPECS) {
        const h = spec.getter(it);
        if (h > 0) {
            let tipoLabel = spec.tipoLabel;
            if (spec.sliceKey === 'diurna') tipoLabel = excelTipoLabelHeLaboralConDomingo(h, diurnaSun, 'diurna');
            if (spec.sliceKey === 'nocturna') tipoLabel = excelTipoLabelHeLaboralConDomingo(h, nocturnaSun, 'nocturna');
            out.push({
                sliceKey: spec.sliceKey,
                tipoLabel,
                hours: h,
                columnKey: spec.columnKey
            });
        }
    }
    if (hasLegacyRecargoSolo(it)) {
        out.push({
            sliceKey: 'recargo_legacy',
            tipoLabel: 'Recargo dominical',
            hours: Number(it.horasRecargoDomingo || 0),
            columnKey: 'horasRecargoDomingo'
        });
    }
    return out.length ? out : null;
}

module.exports = {
    buildHoraExtraExportSlices,
    compensacionDominicalExcelEtiqueta,
    formatTipoNovedadHeSlice,
    heDiurnaNocturnaSundayHoursBogota,
    excelTipoLabelHeLaboralConDomingo
};
