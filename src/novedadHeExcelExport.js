'use strict';

const { parseHeDomingoCompFromObservacion } = require('./heDomingoCompensacion');
const {
    bogotaDateKeyFromMs,
    bogotaMidnightUtcMsFromYmd,
    isDiaRecargoDominicalBogotaYmd
} = require('./heDomingoBogota');
const {
    collectHeDiurnaNocturnaSegmentsBogota,
    collectRecargoDomingoDiurnaNocturnaSegmentsBogota,
    resolveRecargoDomingoMaxHorasForDayKey
} = require('./heBogotaSplit');
const {
    HE_TIPO_CANONICO,
    formatHeTipoFromSliceKey,
    resolveHeTiposResumenDesdeHoras,
    mapLegacyTipoHoraExtraToCanonical
} = require('./novedadHeTipoCatalog');

/**
 * @typedef {{ sliceKey: string, tipoLabel: string, hours: number, columnKey: string, startMs?: number, endMs?: number }} HeExcelSlice
 */

const EPS_H = 0.06;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const dtfHmBogota = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

/**
 * Convierte [startMs, endMs) a campos Excel de fecha/hora en calendario Bogotá.
 * @param {number} startMs
 * @param {number} endMs
 * @returns {{ fechaInicio: string, fechaFin: string, horaInicial: string, horaFinal: string }}
 */
function msRangeToExcelHoraFields(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { fechaInicio: '', fechaFin: '', horaInicial: '', horaFinal: '' };
    }
    const inclusiveEndMs = Math.max(startMs, endMs - 1);
    return {
        fechaInicio: bogotaDateKeyFromMs(startMs),
        fechaFin: bogotaDateKeyFromMs(inclusiveEndMs),
        horaInicial: dtfHmBogota.format(new Date(startMs)),
        horaFinal: dtfHmBogota.format(new Date(inclusiveEndMs))
    };
}

/**
 * @param {number} startMs
 * @param {number} endMs
 * @param {(dayKey: string, s: number, e: number) => void} fn
 */
function iterateDayPortions(startMs, endMs, fn) {
    let cursor = startMs;
    while (cursor < endMs) {
        const dayKey = bogotaDateKeyFromMs(cursor);
        const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
        if (dayStart == null) break;
        const dayEnd = dayStart + DAY_MS;
        const s = cursor;
        const e = Math.min(endMs, dayEnd);
        if (e > s) fn(dayKey, s, e);
        cursor = e;
    }
}

const HE_CLOCK_SLICE_KEYS = new Set([
    'diurna_laboral',
    'diurna_dominical',
    'nocturna_laboral',
    'nocturna_dominical'
]);

/**
 * Parte [s, e) en diurna/nocturna (06:00–19:00 Bogotá) del día que empieza en dayStart.
 * @param {number} s
 * @param {number} e
 * @param {number} dayStart
 * @param {(kind: 'diurna'|'nocturna', a: number, b: number) => void} fn
 */
function forEachDiurnaNocturnaInDayWindow(s, e, dayStart, fn) {
    if (e <= s) return;
    const b6 = dayStart + 6 * HOUR_MS;
    const b19 = dayStart + 19 * HOUR_MS;
    const d1 = dayStart + DAY_MS;
    const windows = [
        [dayStart, b6, 'nocturna'],
        [b6, b19, 'diurna'],
        [b19, d1, 'nocturna']
    ];
    for (const [t0, t1, kind] of windows) {
        const a = Math.max(s, t0);
        const b = Math.min(e, t1);
        if (b <= a) continue;
        fn(kind, a, b);
    }
}

/**
 * Horas diurna/nocturna del intervalo crudo que caen en domingo o festivo (sin tope de recargo).
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 * @returns {{ diurnaSun: number, nocturnaSun: number }}
 */
function calendarDiurnaNocturnaSundayHours(startMs, endMs, festivosSet) {
    const out = { diurnaSun: 0, nocturnaSun: 0 };
    iterateDayPortions(startMs, endMs, (dayKey, s, e) => {
        if (!isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet)) return;
        const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
        if (dayStart == null) return;
        forEachDiurnaNocturnaInDayWindow(s, e, dayStart, (kind, a, b) => {
            const h = (b - a) / HOUR_MS;
            if (kind === 'diurna') out.diurnaSun += h;
            else out.nocturnaSun += h;
        });
    });
    return out;
}

/**
 * Franjas diurna/nocturna del intervalo crudo, laboral vs dominical por calendario.
 * Fallback cuando no hay segmentos HE (vuelto en fila sin recargo).
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 * @returns {Map<string, Array<{ startMs: number, endMs: number, hours: number }>>}
 */
function collectCalendarTimedRangesBySliceKey(startMs, endMs, festivosSet) {
    /** @type {Map<string, Array<{ startMs: number, endMs: number, hours: number }>>} */
    const map = new Map();
    iterateDayPortions(startMs, endMs, (dayKey, s, e) => {
        const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
        if (dayStart == null) return;
        const onRecargoDay = isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet);
        forEachDiurnaNocturnaInDayWindow(s, e, dayStart, (kind, a, b) => {
            const hours = (b - a) / HOUR_MS;
            if (hours <= EPS_H) return;
            const sliceKey =
                kind === 'diurna'
                    ? onRecargoDay
                        ? 'diurna_dominical'
                        : 'diurna_laboral'
                    : onRecargoDay
                      ? 'nocturna_dominical'
                      : 'nocturna_laboral';
            if (!map.has(sliceKey)) map.set(sliceKey, []);
            map.get(sliceKey).push({ startMs: a, endMs: b, hours });
        });
    });
    return map;
}

/**
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 * @returns {Map<string, Array<{ startMs: number, endMs: number, hours: number }>>}
 */
function collectTimedRangesBySliceKey(startMs, endMs, festivosSet) {
    /** @type {Map<string, Array<{ startMs: number, endMs: number, hours: number }>>} */
    const map = new Map();

    const addPortion = (sliceKey, s, e) => {
        const hours = (e - s) / HOUR_MS;
        if (hours <= EPS_H) return;
        if (!map.has(sliceKey)) map.set(sliceKey, []);
        map.get(sliceKey).push({ startMs: s, endMs: e, hours });
    };

    const he = collectHeDiurnaNocturnaSegmentsBogota(startMs, endMs, festivosSet);
    const rec = collectRecargoDomingoDiurnaNocturnaSegmentsBogota(startMs, endMs, festivosSet);

    for (const seg of he.diurna) {
        iterateDayPortions(seg.startMs, seg.endMs, (dayKey, s, e) => {
            const key = isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet)
                ? 'diurna_dominical'
                : 'diurna_laboral';
            addPortion(key, s, e);
        });
    }
    for (const seg of he.nocturna) {
        iterateDayPortions(seg.startMs, seg.endMs, (dayKey, s, e) => {
            const onRecargoDay = isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet);
            const key = onRecargoDay ? 'nocturna_dominical' : 'nocturna_laboral';
            addPortion(key, s, e);
            // En día hábil: recargo nocturno ordinario = tramo nocturno.
            // En domingo/festivo: el exceso tras tope de recargo (HE nocturna) también
            // alimenta el slice persistido como horas_recargo_nocturno (malla).
            addPortion('recargo_nocturno_ordinario', s, e);
        });
    }
    for (const seg of rec.diurna) addPortion('recargo_diurno', seg.startMs, seg.endMs);
    for (const seg of rec.nocturna) addPortion('recargo_nocturno', seg.startMs, seg.endMs);

    return map;
}

/**
 * Une corridas contiguas y elige el rango cuya duración más se acerca a sliceHours.
 * @param {string} sliceKey
 * @param {Map<string, Array<{ startMs: number, endMs: number, hours: number }>>} timedByKey
 * @param {number} sliceHours
 * @returns {{ startMs: number, endMs: number }|null}
 */
function pickTimeRangeForSlice(sliceKey, timedByKey, sliceHours) {
    const list = [...(timedByKey.get(sliceKey) || [])].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    if (!list.length) return null;
    if (list.length === 1) return { startMs: list[0].startMs, endMs: list[0].endMs };

    /** @type {Array<Array<{ startMs: number, endMs: number, hours: number }>>} */
    const runs = [];
    let run = [list[0]];
    for (let i = 1; i < list.length; i++) {
        const prev = run[run.length - 1];
        if (list[i].startMs <= prev.endMs + 1) {
            run.push(list[i]);
        } else {
            runs.push(run);
            run = [list[i]];
        }
    }
    runs.push(run);

    /** @type {{ startMs: number, endMs: number }|null} */
    let best = null;
    let bestDiff = Infinity;

    const consider = (startMs, endMs, hours) => {
        const diff = Math.abs(hours - sliceHours);
        if (diff < bestDiff - 1e-9 || (Math.abs(diff - bestDiff) < 1e-9 && best && startMs < best.startMs)) {
            bestDiff = diff;
            best = { startMs, endMs };
        }
    };

    for (const r of runs) {
        const startMs = r[0].startMs;
        const endMs = r[r.length - 1].endMs;
        const sumH = r.reduce((acc, seg) => acc + seg.hours, 0);
        consider(startMs, endMs, sumH);
        consider(startMs, endMs, (endMs - startMs) / HOUR_MS);
    }
    for (const seg of list) {
        consider(seg.startMs, seg.endMs, seg.hours);
    }

    return best;
}

/**
 * @param {object} it
 * @param {HeExcelSlice[]} slices
 * @param {{ toUtcMsFromDateAndTime?: (d: unknown, t: unknown) => number|null, festivosSet?: Set<string> }} dep
 */
function enrichSlicesWithTimeRanges(it, slices, dep) {
    const toUtc = dep?.toUtcMsFromDateAndTime;
    if (typeof toUtc !== 'function' || !slices?.length) return;
    const fi = String(it?.fechaInicio || '').trim().slice(0, 10);
    const ff = String(it?.fechaFin || '').trim().slice(0, 10);
    const hi = String(it?.horaInicio || '').trim();
    const hf = String(it?.horaFin || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fi) || !/^\d{4}-\d{2}-\d{2}$/.test(ff) || !hi || !hf) return;
    const startMs = toUtc(fi, hi);
    const endMs = toUtc(ff, hf);
    if (startMs == null || endMs == null || !Number.isFinite(endMs - startMs) || endMs <= startMs) return;

    const timedByKey = collectTimedRangesBySliceKey(startMs, endMs, dep?.festivosSet);
    let calendarByKey = null;
    for (const slice of slices) {
        const hours = Number(slice.hours || 0);
        let range = pickTimeRangeForSlice(slice.sliceKey, timedByKey, hours);
        if (!range && HE_CLOCK_SLICE_KEYS.has(slice.sliceKey)) {
            if (!calendarByKey) {
                calendarByKey = collectCalendarTimedRangesBySliceKey(startMs, endMs, dep?.festivosSet);
            }
            range = pickTimeRangeForSlice(slice.sliceKey, calendarByKey, hours);
        }
        if (range) {
            slice.startMs = range.startMs;
            slice.endMs = range.endMs;
        }
    }
}

/**
 * Horas diurna/nocturna del intervalo crudo que caen en domingo o festivo Bogotá.
 * No reaplica el tope de recargo: horas_diurnas/nocturnas ya son el vuelto persistido.
 * @param {{ fechaInicio?: string, fechaFin?: string, horaInicio?: string, horaFin?: string }} it
 * @param {{ toUtcMsFromDateAndTime: (d: unknown, t: unknown) => number|null, festivosSet?: Set<string> }} dep
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
    return calendarDiurnaNocturnaSundayHours(startMs, endMs, dep?.festivosSet);
}

/**
 * Divide slice diurna/nocturna en filas laboral y/o dominical según horas en domingo/festivo Bogotá.
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

function sumPortionHours(portions) {
    return portions.reduce((acc, p) => acc + Number(p.hours || 0), 0);
}

function mergePortionRange(portions) {
    if (!portions.length) return null;
    let startMs = portions[0].startMs;
    let endMs = portions[0].endMs;
    for (const p of portions) {
        if (p.startMs < startMs) startMs = p.startMs;
        if (p.endMs > endMs) endMs = p.endMs;
    }
    return { startMs, endMs };
}

/**
 * Porciones de horas_recargo_nocturno: hábil vs domingo/festivo (vuelto post-tope).
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 */
function classifyRnTimedPortions(startMs, endMs, festivosSet) {
    const timed = collectTimedRangesBySliceKey(startMs, endMs, festivosSet);
    const list = timed.get('recargo_nocturno_ordinario') || [];
    /** @type {Array<{ startMs: number, endMs: number, hours: number }>} */
    const weekday = [];
    /** @type {Array<{ startMs: number, endMs: number, hours: number }>} */
    const festivo = [];
    for (const p of list) {
        const dayKey = bogotaDateKeyFromMs(p.startMs);
        if (isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet)) festivo.push(p);
        else weekday.push(p);
    }
    return { weekday, festivo };
}

/**
 * @param {HeExcelSlice[]} out
 * @param {{ sliceKey: string, hours: number, columnKey: string, obs: string, range?: { startMs: number, endMs: number }|null }} args
 */
function pushRnExportSlice(out, args) {
    const hours = Number(args.hours || 0);
    if (hours <= EPS_H) return;
    /** @type {HeExcelSlice} */
    const slice = {
        sliceKey: args.sliceKey,
        tipoLabel: formatHeTipoFromSliceKey(args.sliceKey, args.obs),
        hours,
        columnKey: args.columnKey
    };
    if (args.range) {
        slice.startMs = args.range.startMs;
        slice.endMs = args.range.endMs;
    }
    out.push(slice);
}

/**
 * AUT-307: no tipificar toda la columna rn como HE. Noche hábil = Recargo nocturno;
 * solo el tramo en domingo/festivo (vuelto tras tope) = HE Nocturna Dominical.
 * @param {HeExcelSlice[]} out
 * @param {object} it
 * @param {{ sliceKey: string, columnKey: string, getter: (it: object) => number }} spec
 * @param {string} obs
 * @param {{ toUtcMsFromDateAndTime?: (d: unknown, t: unknown) => number|null, festivosSet?: Set<string> }} dep
 */
function appendRecargoNocturnoOrdinarioSlices(out, it, spec, obs, dep) {
    const rn = spec.getter(it);
    if (rn <= EPS_H) return;

    const fallback = () => {
        pushRnExportSlice(out, {
            sliceKey: 'recargo_nocturno_ordinario',
            hours: rn,
            columnKey: spec.columnKey,
            obs
        });
    };

    const toUtc = dep?.toUtcMsFromDateAndTime;
    const fi = String(it?.fechaInicio || '').trim().slice(0, 10);
    const ff = String(it?.fechaFin || '').trim().slice(0, 10);
    const hi = String(it?.horaInicio || '').trim();
    const hf = String(it?.horaFin || '').trim();
    if (
        typeof toUtc !== 'function' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fi) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(ff) ||
        !hi ||
        !hf
    ) {
        fallback();
        return;
    }

    const startMs = toUtc(fi, hi);
    const endMs = toUtc(ff, hf);
    if (startMs == null || endMs == null || !Number.isFinite(endMs - startMs) || endMs <= startMs) {
        fallback();
        return;
    }

    const { weekday, festivo } = classifyRnTimedPortions(startMs, endMs, dep?.festivosSet);
    const wH = sumPortionHours(weekday);
    const fH = sumPortionHours(festivo);
    const timedTotal = wH + fH;
    if (timedTotal <= EPS_H) {
        fallback();
        return;
    }

    // Asignar rn al calendario: primero noche hábil, el resto al domingo/festivo.
    // No escalar al intervalo completo: si la malla ya guardó rdn, esas horas no van en rn.
    const weekdayHours = Number(Math.min(rn, wH).toFixed(2));
    pushRnExportSlice(out, {
        sliceKey: 'recargo_nocturno_ordinario',
        hours: weekdayHours,
        columnKey: spec.columnKey,
        obs,
        range: mergePortionRange(weekday)
    });

    // AUT-308: horas en domingo/festivo dentro del tope = recargo, no HE.
    // El cruce sábado→domingo mete la madrugada en rn; si no llenó 7 h, es recargo dominical.
    const festivoH = Number(Math.max(0, rn - weekdayHours).toFixed(2));
    const alreadyRecargo =
        Number(it?.horasRecargoDomingoDiurnas || 0) + Number(it?.horasRecargoDomingoNocturnas || 0);
    const festivoDayKey = festivo.length ? bogotaDateKeyFromMs(festivo[0].startMs) : '';
    const cap = festivoDayKey ? resolveRecargoDomingoMaxHorasForDayKey(festivoDayKey) : 0;
    const remainingCap = Math.max(0, cap - alreadyRecargo);
    const asRecargo = Math.min(festivoH, remainingCap);
    const asHe = Number((festivoH - asRecargo).toFixed(2));
    const festivoRange = mergePortionRange(festivo);
    let recargoRange = festivoRange;
    let heRange = festivoRange;
    if (asRecargo > EPS_H && asHe > EPS_H && festivoRange) {
        const recEnd = festivoRange.startMs + Math.round(asRecargo * HOUR_MS);
        recargoRange = { startMs: festivoRange.startMs, endMs: recEnd };
        heRange = { startMs: recEnd, endMs: festivoRange.endMs };
    }
    pushRnExportSlice(out, {
        sliceKey: 'recargo_nocturno',
        hours: Number(asRecargo.toFixed(2)),
        columnKey: spec.columnKey,
        obs,
        range: recargoRange
    });
    pushRnExportSlice(out, {
        sliceKey: 'nocturna_dominical',
        hours: asHe,
        columnKey: spec.columnKey,
        obs,
        range: heRange
    });
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
 * @param {{ toUtcMsFromDateAndTime?: (d: unknown, t: unknown) => number|null, festivosSet?: Set<string> }} [dep]
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
        if (spec.sliceKey === 'recargo_nocturno_ordinario') {
            appendRecargoNocturnoOrdinarioSlices(out, it, spec, obs, dep || {});
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
    if (out.length) enrichSlicesWithTimeRanges(it, out, dep || {});
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
    buildHeLaboralDomingoSlices,
    msRangeToExcelHoraFields,
    enrichSlicesWithTimeRanges,
    collectTimedRangesBySliceKey,
    pickTimeRangeForSlice
};
