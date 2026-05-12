'use strict';

const {
    bogotaDateKeyFromMs,
    bogotaMidnightUtcMsFromYmd,
    isSundayBogotaYmd,
    isDomingoOFestivoBogotaYmd,
    buildSundayReportedSetsFromHeRows,
    sundayStatsForConsultantMonth,
    resolveHourSplitBogotaForRow
} = require('./heDomingoBogota');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Línea fija al inicio o concatenada en he_domingo_observacion para parseo / Excel / gestión. */
const HE_DOMINGO_COMP_MARKER = '[HE_DOMINGO_COMP]';

/**
 * @param {string} ymd
 * @param {number} deltaDays
 * @returns {string} YYYY-MM-DD Bogotá o ''
 */
function addCalendarDaysBogotaYmd(ymd, deltaDays) {
    const d0 = bogotaMidnightUtcMsFromYmd(ymd);
    if (d0 == null || !Number.isFinite(deltaDays)) return '';
    return bogotaDateKeyFromMs(d0 + deltaDays * DAY_MS);
}

/**
 * Ventana de compensatorio en tiempo: cualquier día calendario Bogotá en D+1 … D+15 (D = domingo trabajado).
 * @param {string} workedSundayYmd YYYY-MM-DD domingo con HE
 * @returns {{ compensatorioTiempoMinYmd: string, compensatorioTiempoMaxYmd: string }|null}
 */
function getVentanaCompensatorioTiempo(workedSundayYmd) {
    const d = String(workedSundayYmd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const compensatorioTiempoMinYmd = addCalendarDaysBogotaYmd(d, 1);
    const compensatorioTiempoMaxYmd = addCalendarDaysBogotaYmd(d, 15);
    if (!compensatorioTiempoMinYmd || !compensatorioTiempoMaxYmd) return null;
    return { compensatorioTiempoMinYmd, compensatorioTiempoMaxYmd };
}

/**
 * @param {string} workedSundayYmd
 * @param {string} candidateYmd
 * @returns {boolean}
 */
function isYmdEnVentanaCompensatorio(workedSundayYmd, candidateYmd) {
    const vent = getVentanaCompensatorioTiempo(workedSundayYmd);
    const c = String(candidateYmd || '').trim();
    if (!vent || !/^\d{4}-\d{2}-\d{2}$/.test(c)) return false;
    return c >= vent.compensatorioTiempoMinYmd && c <= vent.compensatorioTiempoMaxYmd;
}

function buildConsultantKeyDefault(row) {
    const cedula = String(row?.cedula || '').trim() || 'sin-cedula';
    const nombre = String(row?.nombre || '').trim() || 'Sin nombre';
    return `${cedula}|||${nombre}`;
}

/**
 * @param {Map<string, number>} draftSplit resolveHourSplitBogotaForRow
 * @param {Map<string, Set<string>>} sundaySets con filas existentes + borrador
 * @param {string} consultantKey
 * @returns {string|null} YYYY-MM-DD domingo trabajado que ancla la ventana
 */
function pickWorkedSundayYmd(draftSplit, sundaySets, consultantKey, festivosSet) {
    const draftSundays = [...draftSplit.entries()]
        .filter(([k, h]) => isDomingoOFestivoBogotaYmd(k, festivosSet) && Number(h) > 0 && Number.isFinite(Number(h)))
        .map(([k]) => k)
        .sort();
    if (!draftSundays.length) return null;

    let pickTier2 = null;
    for (const d of draftSundays) {
        const mk = d.slice(0, 7);
        const t = sundayStatsForConsultantMonth(sundaySets, consultantKey, mk).tier;
        if (t === 2 && (!pickTier2 || d > pickTier2)) pickTier2 = d;
    }
    if (pickTier2) return pickTier2;

    let pickTier1 = null;
    for (const d of draftSundays) {
        const mk = d.slice(0, 7);
        const t = sundayStatsForConsultantMonth(sundaySets, consultantKey, mk).tier;
        if (t === 1 && (!pickTier1 || d > pickTier1)) pickTier1 = d;
    }
    if (pickTier1) return pickTier1;

    for (let i = draftSundays.length - 1; i >= 0; i -= 1) {
        const d = draftSundays[i];
        const mk = d.slice(0, 7);
        const t = sundayStatsForConsultantMonth(sundaySets, consultantKey, mk).tier;
        if (t >= 3) return d;
    }
    return draftSundays[draftSundays.length - 1];
}

/**
 * @param {object[]} existingRows filas HE desde BD
 * @param {object} syntheticRow borrador con nombre, cedula, fecha_inicio/fin, hora_inicio/fin
 * @param {{ toUtcMsFromDateAndTime: Function, resolveFallbackDateKeyFromRow: Function }} dep
 * @param {Function} [buildConsultantKey]
 */
function computeHeDomingoCompensacionPreview(existingRows, syntheticRow, dep, buildConsultantKey = buildConsultantKeyDefault) {
    const ck = buildConsultantKey(syntheticRow);
    const allRows = [...(existingRows || []), syntheticRow];
    const sundaySets = buildSundayReportedSetsFromHeRows(allRows, buildConsultantKey, dep);
    const draftSplit = resolveHourSplitBogotaForRow(syntheticRow, dep);

    const festivosSet = dep.festivosSet;
    const draftSundays = [...draftSplit.entries()]
        .filter(([k, h]) => isDomingoOFestivoBogotaYmd(k, festivosSet) && Number(h) > 0)
        .map(([k]) => k)
        .sort();

    const emptyVentana = {
        compensatorioTiempoMinYmd: null,
        compensatorioTiempoMaxYmd: null
    };

    if (!draftSundays.length) {
        return {
            requiereEleccionCompensacion: false,
            esTercerDomingoOMas: false,
            domingoTrabajadoYmd: null,
            ...emptyVentana,
            maxTier: 0
        };
    }

    let maxTier = 0;
    for (const d of draftSundays) {
        const mk = d.slice(0, 7);
        const t = sundayStatsForConsultantMonth(sundaySets, ck, mk).tier;
        if (t > maxTier) maxTier = t;
    }

    const esTercerDomingoOMas = maxTier >= 3;
    const requiereEleccionCompensacion = maxTier === 1 || maxTier === 2;
    const domingoTrabajadoYmd = pickWorkedSundayYmd(draftSplit, sundaySets, ck, festivosSet);
    const vent =
        requiereEleccionCompensacion && domingoTrabajadoYmd
            ? getVentanaCompensatorioTiempo(domingoTrabajadoYmd)
            : null;

    return {
        requiereEleccionCompensacion,
        esTercerDomingoOMas,
        domingoTrabajadoYmd,
        compensatorioTiempoMinYmd: vent?.compensatorioTiempoMinYmd ?? null,
        compensatorioTiempoMaxYmd: vent?.compensatorioTiempoMaxYmd ?? null,
        maxTier
    };
}

/**
 * @param {{ mode: 'tiempo'|'dinero'|'tercer_domingo', workedYmd: string, compensatorioYmd?: string }} p
 */
function buildHeDomingoCompObservacionLine(p) {
    const mode = String(p?.mode || '').trim();
    const worked = String(p?.workedYmd || '').trim();
    const comp = String(p?.compensatorioYmd || '').trim();
    if (!mode || !/^\d{4}-\d{2}-\d{2}$/.test(worked)) return '';
    if (mode === 'tiempo') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(comp)) return '';
        return `${HE_DOMINGO_COMP_MARKER} modo=tiempo; trabajado=${worked}; compensatorio=${comp}`;
    }
    if (mode === 'dinero') {
        return `${HE_DOMINGO_COMP_MARKER} modo=dinero; trabajado=${worked}`;
    }
    if (mode === 'tercer_domingo') {
        return `${HE_DOMINGO_COMP_MARKER} modo=tercer_domingo; trabajado=${worked}`;
    }
    return '';
}

/**
 * @param {string} observacion
 * @returns {{ mode: string, workedYmd: string, compensatorioYmd: string }|null}
 */
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
    const mode = m[1];
    const workedYmd = m[2];
    const compensatorioYmd = String(m[3] || '').trim();
    if (mode === 'tiempo' && !/^\d{4}-\d{2}-\d{2}$/.test(compensatorioYmd)) return null;
    return { mode, workedYmd, compensatorioYmd };
}

/**
 * Sufijo para «Tipo Novedad» en Excel / UI.
 * @param {string} [observacion]
 */
function formatHeDomingoCompTipoSuffix(observacion) {
    const p = parseHeDomingoCompFromObservacion(observacion);
    if (!p) return '';
    if (p.mode === 'tiempo') return ' — Dominical compensado en tiempo';
    if (p.mode === 'dinero') return ' — Dominical compensado en dinero';
    if (p.mode === 'tercer_domingo') return ' — Dominical tercer domingo del mes';
    return '';
}

/**
 * Texto corto para panel de gestión.
 */
function formatHeDomingoCompGestionResumen(observacion) {
    const p = parseHeDomingoCompFromObservacion(observacion);
    if (!p) return '';
    if (p.mode === 'tiempo') {
        return `Compensación dominical: tiempo — día compensatorio ${p.compensatorioYmd || '—'} (domingo trabajado ${p.workedYmd})`;
    }
    if (p.mode === 'dinero') {
        return `Compensación dominical: en dinero (domingo trabajado ${p.workedYmd})`;
    }
    if (p.mode === 'tercer_domingo') {
        return `Compensación dominical: tercer domingo del mes (domingo trabajado ${p.workedYmd})`;
    }
    return '';
}

/**
 * Fila mínima compatible con resolveHourSplitBogotaForRow / buildSundayReportedSetsFromHeRows.
 */
function buildSyntheticHoraExtraRow({ nombre, cedula, fechaInicio, fechaFin, horaInicio, horaFin }) {
    return {
        nombre: String(nombre || '').trim(),
        cedula: String(cedula || '').trim(),
        tipo_novedad: 'Hora Extra',
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        cantidad_horas: 0,
        creado_en: null
    };
}

module.exports = {
    HE_DOMINGO_COMP_MARKER,
    addCalendarDaysBogotaYmd,
    getVentanaCompensatorioTiempo,
    isYmdEnVentanaCompensatorio,
    computeHeDomingoCompensacionPreview,
    buildHeDomingoCompObservacionLine,
    parseHeDomingoCompFromObservacion,
    formatHeDomingoCompTipoSuffix,
    formatHeDomingoCompGestionResumen,
    buildConsultantKeyDefault,
    buildSyntheticHoraExtraRow
};
