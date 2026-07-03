'use strict';

/** Si cambias la lógica aquí, mantén alineado `react-frontend/src/heNovedadBogotaClient.js` (ESM para Vite). */
const {
    bogotaDateKeyFromMs,
    isDiaRecargoDominicalBogotaYmd,
    bogotaMidnightUtcMsFromYmd,
    isSaturdayBogotaYmd,
    isSundayBogotaYmd
} = require('./heDomingoBogota');

/** Máximo horas recargo dominical por cada domingo calendario Bogotá. */
const RECARGO_DOMINGO_MAX_HORAS = 7.33;

/** Diurna: 06:00 inclusive – 18:59 inclusive (minuto < 19:00), reloj Bogotá. */
const HORA_DIURNA_INICIO_MIN = 6 * 60;
const HORA_NOCTURNA_INICIO_MIN = 19 * 60;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** 7,33 h en ms (7 × 3600 + 19 × 60 + 48 = 26388 s). */
const RECARGO_DOMINGO_MAX_MS = Math.round(7.33 * 3600 * 1000);

const dtfHm = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

/**
 * @param {number} ms
 * @returns {number} minutos desde medianoche Bogotá [0, 1439]
 */
function bogotaMinuteOfDayFromMs(ms) {
    const parts = dtfHm.formatToParts(new Date(ms));
    let h = 0;
    let m = 0;
    for (const p of parts) {
        if (p.type === 'hour') h = Number(p.value);
        if (p.type === 'minute') m = Number(p.value);
    }
    return h * 60 + m;
}

function isDiurnaBogotaMinute(minuteOfDay) {
    return minuteOfDay >= HORA_DIURNA_INICIO_MIN && minuteOfDay < HORA_NOCTURNA_INICIO_MIN;
}

/**
 * Suma ms diurnos/nocturnos en [s, e) según reloj Bogotá dentro del día que empieza en dayStart.
 * @param {number} s
 * @param {number} e
 * @param {number} dayStart medianoche Bogotá del día (UTC ms)
 * @param {{ diurnaMs: number, nocturnaMs: number }} out
 */
function accumulateDiurnaNocturnaInDayWindow(s, e, dayStart, out) {
    if (e <= s) return;
    const b6 = dayStart + 6 * HOUR_MS;
    const b19 = dayStart + 19 * HOUR_MS;
    const d1 = dayStart + DAY_MS;
    const windows = [
        [dayStart, b6],
        [b6, b19],
        [b19, d1]
    ];
    const kinds = ['nocturna', 'diurna', 'nocturna'];
    for (let i = 0; i < 3; i += 1) {
        const [t0, t1] = windows[i];
        const a = Math.max(s, t0);
        const b = Math.min(e, t1);
        if (b <= a) continue;
        const len = b - a;
        if (kinds[i] === 'diurna') out.diurnaMs += len;
        else out.nocturnaMs += len;
    }
}

/**
 * @param {Array<{ startMs: number, endMs: number }>} arr
 * @param {number} s
 * @param {number} e
 */
function pushMergedSegment(arr, s, e) {
    if (e <= s) return;
    const last = arr[arr.length - 1];
    if (last && last.endMs === s) last.endMs = e;
    else arr.push({ startMs: s, endMs: e });
}

/**
 * @param {Array<{ startMs: number, endMs: number }>} diurna
 * @param {Array<{ startMs: number, endMs: number }>} nocturna
 * @param {number} s
 * @param {number} e
 * @param {number} dayStart
 */
function pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, s, e, dayStart) {
    if (e <= s) return;
    const b6 = dayStart + 6 * HOUR_MS;
    const b19 = dayStart + 19 * HOUR_MS;
    const d1 = dayStart + DAY_MS;
    const windows = [
        [dayStart, b6, nocturna],
        [b6, b19, diurna],
        [b19, d1, nocturna]
    ];
    for (const [t0, t1, arr] of windows) {
        const a = Math.max(s, t0);
        const b = Math.min(e, t1);
        if (b <= a) continue;
        pushMergedSegment(arr, a, b);
    }
}

function msBucketsToSplit(buckets) {
    const horasRecargoDomingoDiurnas = Number((buckets.recargo.diurnaMs / HOUR_MS).toFixed(2));
    const horasRecargoDomingoNocturnas = Number((buckets.recargo.nocturnaMs / HOUR_MS).toFixed(2));
    const horasRecargoDomingo = Number((horasRecargoDomingoDiurnas + horasRecargoDomingoNocturnas).toFixed(2));
    const diurnas = Number((buckets.he.diurnaMs / HOUR_MS).toFixed(2));
    const nocturnas = Number((buckets.he.nocturnaMs / HOUR_MS).toFixed(2));
    const total = Number((diurnas + nocturnas + horasRecargoDomingo).toFixed(2));
    return {
        total,
        horasRecargoDomingo,
        horasRecargoDomingoDiurnas,
        horasRecargoDomingoNocturnas,
        diurnas,
        nocturnas
    };
}

function createMsBuckets() {
    return {
        recargo: { diurnaMs: 0, nocturnaMs: 0 },
        he: { diurnaMs: 0, nocturnaMs: 0 }
    };
}

/**
 * HE que inicia en sábado y cruza al domingo: la porción dominical cuenta como HE, no recargo.
 * @param {number} intervalStartMs
 * @param {string} dayKey YYYY-MM-DD del tramo actual
 * @param {Set<string>} [festivosSet]
 */
function isSabadoInicioCruzaDomingoHe(intervalStartMs, dayKey, festivosSet) {
    if (!Number.isFinite(intervalStartMs) || !dayKey) return false;
    if (!isSaturdayBogotaYmd(bogotaDateKeyFromMs(intervalStartMs))) return false;
    if (!isSundayBogotaYmd(dayKey)) return false;
    return isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet);
}

/**
 * @param {number} s
 * @param {number} e
 * @param {number} dayStart
 * @param {boolean} isRecargoDay
 * @param {{ value: number }} recargoBudget ms restantes ese domingo/festivo
 * @param {{ recargo: { diurnaMs: number, nocturnaMs: number }, he: { diurnaMs: number, nocturnaMs: number } }} buckets
 */
function processSegmentOnRecargoDay(s, e, dayStart, isRecargoDay, recargoBudget, buckets) {
    if (e <= s) return;
    if (!isRecargoDay) {
        accumulateDiurnaNocturnaInDayWindow(s, e, dayStart, buckets.he);
        return;
    }
    const rlen = Math.min(e - s, Math.max(0, recargoBudget.value));
    const after = s + rlen;
    accumulateDiurnaNocturnaInDayWindow(s, after, dayStart, buckets.recargo);
    recargoBudget.value -= rlen;
    if (e > after) accumulateDiurnaNocturnaInDayWindow(after, e, dayStart, buckets.he);
}

/**
 * Días calendario Bogotá dominical/festivo con trabajo en [startMs, endMs).
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 * @returns {string[]}
 */
function collectRecargoDayKeysInInterval(startMs, endMs, festivosSet) {
    /** @type {string[]} */
    const out = [];
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return out;
    let cursor = startMs;
    const seen = new Set();
    while (cursor < endMs) {
        const dayKey = bogotaDateKeyFromMs(cursor);
        const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
        if (dayStart == null) break;
        const dayEnd = dayStart + DAY_MS;
        const e = Math.min(endMs, dayEnd);
        if (e > cursor && isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet) && !seen.has(dayKey)) {
            seen.add(dayKey);
            out.push(dayKey);
        }
        cursor = e;
    }
    return out;
}

/**
 * Split HE con presupuesto compartido de 7,33 h por domingo/festivo y cédula (varias filas).
 * @param {Array<{ rowKey: string|number, startMs: number, endMs: number }>} rows
 * @param {Set<string>} [festivosSet]
 * @returns {Map<string, { total: number, horasRecargoDomingo: number, horasRecargoDomingoDiurnas: number, horasRecargoDomingoNocturnas: number, diurnas: number, nocturnas: number }>}
 */
function computeHoraExtraGroupSplitBogota(rows, festivosSet) {
    /** @type {Map<string, ReturnType<typeof createMsBuckets>>} */
    const bucketsByRow = new Map();
    /** @type {Array<{ dayKey: string, rowKey: string, startMs: number, endMs: number, dayStart: number }>} */
    const recargoSegs = [];

    for (const row of rows || []) {
        const rowKey = String(row?.rowKey ?? '');
        if (!rowKey) continue;
        if (!bucketsByRow.has(rowKey)) bucketsByRow.set(rowKey, createMsBuckets());
        const startMs = row.startMs;
        const endMs = row.endMs;
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

        let cursor = startMs;
        while (cursor < endMs) {
            const dayKey = bogotaDateKeyFromMs(cursor);
            const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
            if (dayStart == null) break;
            const dayEnd = dayStart + DAY_MS;
            const s = cursor;
            const e = Math.min(endMs, dayEnd);
            cursor = e;
            if (e <= s) continue;

            if (isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet)) {
                if (isSabadoInicioCruzaDomingoHe(startMs, dayKey, festivosSet)) {
                    processSegmentOnRecargoDay(s, e, dayStart, false, { value: 0 }, bucketsByRow.get(rowKey));
                } else {
                    recargoSegs.push({ dayKey, rowKey, startMs: s, endMs: e, dayStart });
                }
            } else {
                processSegmentOnRecargoDay(s, e, dayStart, false, { value: 0 }, bucketsByRow.get(rowKey));
            }
        }
    }

    const byDay = new Map();
    for (const seg of recargoSegs) {
        if (!byDay.has(seg.dayKey)) byDay.set(seg.dayKey, []);
        byDay.get(seg.dayKey).push(seg);
    }
    for (const segs of byDay.values()) {
        segs.sort((a, b) => a.startMs - b.startMs || a.rowKey.localeCompare(b.rowKey));
        const budget = { value: RECARGO_DOMINGO_MAX_MS };
        for (const seg of segs) {
            const buckets = bucketsByRow.get(seg.rowKey);
            if (!buckets) continue;
            processSegmentOnRecargoDay(seg.startMs, seg.endMs, seg.dayStart, true, budget, buckets);
        }
    }

    /** @type {Map<string, ReturnType<typeof msBucketsToSplit>>} */
    const out = new Map();
    for (const [rowKey, buckets] of bucketsByRow) {
        out.set(rowKey, msBucketsToSplit(buckets));
    }
    return out;
}

/**
 * Recorre [startMs, endMs) por días calendario Bogotá y acumula recargo dom./festivo
 * (diurno/nocturno en las primeras 7,33 h del domingo o festivo) y HE diurna/nocturna (resto).
 * Si `festivosSet` no se provee, solo los domingos disparan recargo (back-compat).
 *
 * @param {number|null} startMs
 * @param {number|null} endMs
 * @param {Set<string>} [festivosSet] YYYY-MM-DD calendario Bogotá; festivos no-domingo
 * @returns {{ total: number, horasRecargoDomingo: number, horasRecargoDomingoDiurnas: number, horasRecargoDomingoNocturnas: number, diurnas: number, nocturnas: number }}
 */
function computeHoraExtraSplitBogota(startMs, endMs, festivosSet) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return {
            total: 0,
            horasRecargoDomingo: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            diurnas: 0,
            nocturnas: 0
        };
    }
    const group = computeHoraExtraGroupSplitBogota([{ rowKey: '_single', startMs, endMs }], festivosSet);
    return (
        group.get('_single') || {
            total: 0,
            horasRecargoDomingo: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            diurnas: 0,
            nocturnas: 0
        }
    );
}

/**
 * Segmentos HE diurna/nocturna laborales (excluye los primeros L ms de día con recargo).
 * Si `festivosSet` se provee, los festivos no-domingo también descuentan recargo.
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 * @returns {{ diurna: Array<{startMs: number, endMs: number}>, nocturna: Array<{startMs: number, endMs: number}> }}
 */
function collectHeDiurnaNocturnaSegmentsBogota(startMs, endMs, festivosSet) {
    const diurna = [];
    const nocturna = [];
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { diurna, nocturna };
    }

    let cursor = startMs;

    while (cursor < endMs) {
        const dayKey = bogotaDateKeyFromMs(cursor);
        const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
        if (dayStart == null) break;
        const dayEnd = dayStart + DAY_MS;
        const s = cursor;
        const e = Math.min(endMs, dayEnd);
        if (e <= s) {
            cursor = e;
            continue;
        }

        if (isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet)) {
            if (isSabadoInicioCruzaDomingoHe(startMs, dayKey, festivosSet)) {
                pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, s, e, dayStart);
            } else {
                const rlen = Math.min(e - s, RECARGO_DOMINGO_MAX_MS);
                const after = s + rlen;
                if (e > after) pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, after, e, dayStart);
            }
        } else {
            pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, s, e, dayStart);
        }
        cursor = e;
    }

    return { diurna, nocturna };
}

/**
 * Segmentos del tramo de recargo dominical/festivo (primeros L ms del día, L ≤ 7,33 h),
 * partidos por franja Bogotá. Sin `festivosSet` solo aplica a domingo (back-compat).
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} [festivosSet]
 * @returns {{ diurna: Array<{startMs: number, endMs: number}>, nocturna: Array<{startMs: number, endMs: number}> }}
 */
function collectRecargoDomingoDiurnaNocturnaSegmentsBogota(startMs, endMs, festivosSet) {
    const diurna = [];
    const nocturna = [];
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { diurna, nocturna };
    }

    let cursor = startMs;

    while (cursor < endMs) {
        const dayKey = bogotaDateKeyFromMs(cursor);
        const dayStart = bogotaMidnightUtcMsFromYmd(dayKey);
        if (dayStart == null) break;
        const dayEnd = dayStart + DAY_MS;
        const s = cursor;
        const e = Math.min(endMs, dayEnd);
        if (e <= s) {
            cursor = e;
            continue;
        }

        if (isDiaRecargoDominicalBogotaYmd(dayKey, festivosSet)) {
            if (!isSabadoInicioCruzaDomingoHe(startMs, dayKey, festivosSet)) {
                const rlen = Math.min(e - s, RECARGO_DOMINGO_MAX_MS);
                const after = s + rlen;
                pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, s, after, dayStart);
            }
        }
        cursor = e;
    }

    return { diurna, nocturna };
}

const dtfFull = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

function formatBogotaYmdHm(ms) {
    const s = dtfFull.format(new Date(ms));
    return s.replace(' ', 'T');
}

/**
 * Etiqueta legible para un segmento [startMs, endMs) exclusivo en fin.
 * Si cruza fecha calendario Bogotá, incluye YYYY-MM-DD en cada extremo.
 */
function formatHeSegmentRangeBogota(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return '';
    /** [startMs, endMs): endMs es el primer instante fuera. Mostrar fin del último instante dentro (evita mostrar 19:00 en tramo diurno que termina en la frontera nocturna). */
    const inclusiveEndMs = Math.max(startMs, endMs - 1);
    const a = formatBogotaYmdHm(startMs);
    const b = formatBogotaYmdHm(inclusiveEndMs);
    const [da, ta] = a.split('T');
    const [db, tb] = b.split('T');
    if (da === db) return `(${ta.slice(0, 5)}–${tb.slice(0, 5)})`;
    return `(${da} ${ta.slice(0, 5)}–${db} ${tb.slice(0, 5)})`;
}

/**
 * @param {Array<{startMs: number, endMs: number}>} segments
 * @returns {string}
 */
function formatHeSegmentListBogota(segments) {
    if (!segments || segments.length === 0) return '—';
    return segments.map((seg) => formatHeSegmentRangeBogota(seg.startMs, seg.endMs)).join('; ');
}

/**
 * Etiqueta tipo HE: eje diurno = HE diurna + recargo dom. diurno; eje nocturno = HE nocturna + recargo dom. nocturno.
 */
function resolveHoraExtraLabel(heDiurnas, heNocturnas, recDomDiurnas, recDomNocturnas) {
    const d = Number(heDiurnas || 0) + Number(recDomDiurnas || 0);
    const n = Number(heNocturnas || 0) + Number(recDomNocturnas || 0);
    if (d > 0 && n > 0) return 'Mixta';
    if (d > 0) return 'Diurna';
    if (n > 0) return 'Nocturna';
    return null;
}

module.exports = {
    RECARGO_DOMINGO_MAX_HORAS,
    RECARGO_DOMINGO_MAX_MS,
    bogotaMinuteOfDayFromMs,
    isDiurnaBogotaMinute,
    computeHoraExtraSplitBogota,
    computeHoraExtraGroupSplitBogota,
    collectRecargoDayKeysInInterval,
    collectHeDiurnaNocturnaSegmentsBogota,
    collectRecargoDomingoDiurnaNocturnaSegmentsBogota,
    formatHeSegmentRangeBogota,
    formatHeSegmentListBogota,
    resolveHoraExtraLabel
};
