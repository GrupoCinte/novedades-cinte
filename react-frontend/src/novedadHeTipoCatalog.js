const HE_DOMINGO_COMP_MARKER = '[HE_DOMINGO_COMP]';

/** Catálogo funcional de 7 tipos HE/recargo (presentación Excel + UI). */
export const HE_TIPO_CANONICO = {
    HE_DIURNA: 'Hora Extra Diurna',
    HE_DIURNA_DOM: 'Hora Extra Diurna Dominical',
    HE_NOCTURNA: 'Hora Extra Nocturna',
    HE_NOCTURNA_DOM: 'Hora Extra Nocturna Dominical',
    REC_DOM_DIURNO: 'Recargo dominical /festivo diurno',
    REC_DOM_NOCTURNO: 'Recargo dominical /festivo nocturno',
    REC_NOCTURNO: 'Recargo nocturno'
};

export const HE_TIPO_CATALOGO_ORDEN = [
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

function parseHeDomingoCompFromObservacion(observacion) {
    const raw = String(observacion || '');
    const idx = raw.indexOf(HE_DOMINGO_COMP_MARKER);
    if (idx < 0) return null;
    const line = raw.slice(idx).split(/\r?\n/)[0].trim();
    const esc = HE_DOMINGO_COMP_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        `${esc}\\s*modo=(tiempo|dinero|tercer_domingo);\\s*trabajado=(\\d{4}-\\d{2}-\\d{2})(?:;\\s*compensatorio=(\\d{4}-\\d{2}-\\d{2}))?`
    );
    const m = re.exec(line);
    if (!m) return null;
    return { mode: m[1], workedYmd: m[2], compensatorioYmd: String(m[3] || '').trim() };
}

export function sliceKeyReceivesCompensatorioSuffix(sliceKey) {
    return DOMINICAL_SLICE_KEYS.has(sliceKey);
}

export function resolveHeCompensatorioSuffix(observacion, sliceKey) {
    if (!sliceKeyReceivesCompensatorioSuffix(sliceKey)) return '';
    const p = parseHeDomingoCompFromObservacion(observacion);
    if (p && p.mode === 'tiempo') return ' — con compensatorio';
    return ' — sin compensatorio';
}

export function formatHeTipoNovedadDisplay(canonicalLabel, observacion, sliceKey) {
    const base = String(canonicalLabel || '').trim();
    if (!base) return '';
    return base + resolveHeCompensatorioSuffix(observacion, sliceKey);
}

/**
 * Etiqueta resumida para lista de novedades HE (sin split domingo/laboral en tramo).
 * @param {object} it
 * @returns {string}
 */
export function formatHeTiposResumenParaItem(it) {
    const obs = String(it?.heDomingoObservacion || '');
    const labels = [];
    const hd = Number(it?.horasDiurnas || 0);
    const hn = Number(it?.horasNocturnas || 0);
    const rdd = Number(it?.horasRecargoDomingoDiurnas || 0);
    const rdn = Number(it?.horasRecargoDomingoNocturnas || 0);
    const rTot = Number(it?.horasRecargoDomingo || 0);
    const rn = Number(it?.horasRecargoNocturno || 0);
    if (hd > 0) labels.push(formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.HE_DIURNA, obs, 'diurna_laboral'));
    if (hn > 0) labels.push(formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.HE_NOCTURNA, obs, 'nocturna_laboral'));
    if (rn > 0) labels.push(formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.REC_NOCTURNO, obs, 'recargo_nocturno_ordinario'));
    if (rdd > 0) labels.push(formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.REC_DOM_DIURNO, obs, 'recargo_diurno'));
    if (rdn > 0) labels.push(formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.REC_DOM_NOCTURNO, obs, 'recargo_nocturno'));
    if (rTot > 0 && rdd === 0 && rdn === 0) {
        labels.push(formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.REC_DOM_DIURNO, obs, 'recargo_legacy'));
    }
    if (labels.length) return labels.join(', ');
    const raw = String(it?.tipoHoraExtra || '').trim();
    if (!raw) return '';
    const fold = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    if (fold === 'diurna') return HE_TIPO_CANONICO.HE_DIURNA;
    if (fold === 'nocturna') return HE_TIPO_CANONICO.HE_NOCTURNA;
    if (fold === 'mixta') return `${HE_TIPO_CANONICO.HE_DIURNA}, ${HE_TIPO_CANONICO.HE_NOCTURNA}`;
    return raw;
}
