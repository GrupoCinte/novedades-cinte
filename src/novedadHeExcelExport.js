'use strict';

const { formatHeDomingoCompTipoSuffix, parseHeDomingoCompFromObservacion } = require('./heDomingoCompensacion');

/**
 * @typedef {{ sliceKey: string, tipoLabel: string, hours: number, columnKey: string }} HeExcelSlice
 */

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
 * @returns {HeExcelSlice[]|null} null = usar fila única legacy (sin componentes > 0)
 */
function buildHoraExtraExportSlices(it) {
    /** @type {HeExcelSlice[]} */
    const out = [];
    for (const spec of SLICE_SPECS) {
        const h = spec.getter(it);
        if (h > 0) {
            out.push({
                sliceKey: spec.sliceKey,
                tipoLabel: spec.tipoLabel,
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
    formatTipoNovedadHeSlice
};
