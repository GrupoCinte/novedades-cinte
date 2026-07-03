'use strict';

const { parseHeDomingoCompFromObservacion } = require('./heDomingoCompensacion');

/** Catálogo funcional de 7 tipos HE/recargo (presentación Excel + UI). */
const HE_TIPO_CANONICO = {
    HE_DIURNA: 'Hora Extra Diurna',
    HE_DIURNA_DOM: 'Hora Extra Diurna Dominical',
    HE_NOCTURNA: 'Hora Extra Nocturna',
    HE_NOCTURNA_DOM: 'Hora Extra Nocturna Dominical',
    REC_DOM_DIURNO: 'Recargo dominical /festivo diurno',
    REC_DOM_NOCTURNO: 'Recargo dominical /festivo nocturno',
    REC_NOCTURNO: 'Recargo nocturno'
};

/** Orden estable para selects y listados. */
const HE_TIPO_CATALOGO_ORDEN = [
    HE_TIPO_CANONICO.HE_DIURNA,
    HE_TIPO_CANONICO.HE_DIURNA_DOM,
    HE_TIPO_CANONICO.HE_NOCTURNA,
    HE_TIPO_CANONICO.HE_NOCTURNA_DOM,
    HE_TIPO_CANONICO.REC_DOM_DIURNO,
    HE_TIPO_CANONICO.REC_DOM_NOCTURNO,
    HE_TIPO_CANONICO.REC_NOCTURNO
];

const DOMINICAL_SLICE_KEYS = new Set([
    'diurna_dominical',
    'nocturna_dominical',
    'recargo_diurno',
    'recargo_nocturno',
    'recargo_legacy'
]);

const SLICE_KEY_TO_CANONICAL = {
    diurna_laboral: HE_TIPO_CANONICO.HE_DIURNA,
    diurna_dominical: HE_TIPO_CANONICO.HE_DIURNA_DOM,
    nocturna_laboral: HE_TIPO_CANONICO.HE_NOCTURNA,
    nocturna_dominical: HE_TIPO_CANONICO.HE_NOCTURNA_DOM,
    recargo_diurno: HE_TIPO_CANONICO.REC_DOM_DIURNO,
    recargo_nocturno: HE_TIPO_CANONICO.REC_DOM_NOCTURNO,
    recargo_nocturno_ordinario: HE_TIPO_CANONICO.REC_NOCTURNO,
    recargo_legacy: HE_TIPO_CANONICO.REC_DOM_DIURNO
};

/**
 * @param {string} sliceKey
 * @returns {boolean}
 */
function sliceKeyReceivesCompensatorioSuffix(sliceKey) {
    return DOMINICAL_SLICE_KEYS.has(sliceKey);
}

/**
 * @param {string} observacion he_domingo_observacion
 * @param {string} sliceKey
 * @returns {'' | ' — con compensatorio' | ' — sin compensatorio'}
 */
function resolveHeCompensatorioSuffix(observacion, sliceKey) {
    if (!sliceKeyReceivesCompensatorioSuffix(sliceKey)) return '';
    const p = parseHeDomingoCompFromObservacion(String(observacion || ''));
    if (p && p.mode === 'tiempo') return ' — con compensatorio';
    return ' — sin compensatorio';
}

/**
 * @param {string} canonicalLabel
 * @param {string} observacion
 * @param {string} sliceKey
 * @returns {string}
 */
function formatHeTipoNovedadDisplay(canonicalLabel, observacion, sliceKey) {
    const base = String(canonicalLabel || '').trim();
    if (!base) return '';
    return base + resolveHeCompensatorioSuffix(observacion, sliceKey);
}

/**
 * @param {string} sliceKey
 * @param {string} observacion
 * @returns {string}
 */
function formatHeTipoFromSliceKey(sliceKey, observacion) {
    const canonical = SLICE_KEY_TO_CANONICAL[sliceKey] || '';
    return formatHeTipoNovedadDisplay(canonical, observacion, sliceKey);
}

/**
 * Resumen de tipos canónicos a partir de horas (sin split domingo/laboral en tramo HE).
 * @param {object} it
 * @returns {string[]}
 */
function resolveHeTiposResumenDesdeHoras(it) {
    /** @type {string[]} */
    const out = [];
    const obs = String(it?.heDomingoObservacion || '');
    const hd = Number(it?.horasDiurnas || 0);
    const hn = Number(it?.horasNocturnas || 0);
    const rdd = Number(it?.horasRecargoDomingoDiurnas || 0);
    const rdn = Number(it?.horasRecargoDomingoNocturnas || 0);
    const rTot = Number(it?.horasRecargoDomingo || 0);
    const rn = Number(it?.horasRecargoNocturno || 0);
    if (hd > 0) out.push(formatHeTipoFromSliceKey('diurna_laboral', obs));
    if (hn > 0) out.push(formatHeTipoFromSliceKey('nocturna_laboral', obs));
    if (rn > 0) out.push(formatHeTipoFromSliceKey('recargo_nocturno_ordinario', obs));
    if (rdd > 0) out.push(formatHeTipoFromSliceKey('recargo_diurno', obs));
    if (rdn > 0) out.push(formatHeTipoFromSliceKey('recargo_nocturno', obs));
    if (rTot > 0 && rdd === 0 && rdn === 0) out.push(formatHeTipoFromSliceKey('recargo_legacy', obs));
    return out;
}

/**
 * @param {string} raw tipo_hora_extra legacy
 * @returns {string[]}
 */
function mapLegacyTipoHoraExtraToCanonical(raw) {
    const fold = String(raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    if (fold === 'diurna') return [HE_TIPO_CANONICO.HE_DIURNA];
    if (fold === 'nocturna') return [HE_TIPO_CANONICO.HE_NOCTURNA];
    if (fold === 'mixta') return [HE_TIPO_CANONICO.HE_DIURNA, HE_TIPO_CANONICO.HE_NOCTURNA];
    if (fold.includes('recargo') && fold.includes('nocturn')) return [HE_TIPO_CANONICO.REC_NOCTURNO];
    if (raw) return [String(raw).trim()];
    return [];
}

module.exports = {
    HE_TIPO_CANONICO,
    HE_TIPO_CATALOGO_ORDEN,
    DOMINICAL_SLICE_KEYS,
    SLICE_KEY_TO_CANONICAL,
    sliceKeyReceivesCompensatorioSuffix,
    resolveHeCompensatorioSuffix,
    formatHeTipoNovedadDisplay,
    formatHeTipoFromSliceKey,
    resolveHeTiposResumenDesdeHoras,
    mapLegacyTipoHoraExtraToCanonical
};
