'use strict';

/** Si cambias la lógica aquí, mantén alineado `react-frontend/src/heNovedadBogotaClient.js` (ESM para Vite). */
const { bogotaDateKeyFromMs, isSundayBogotaYmd, bogotaMidnightUtcMsFromYmd } = require('./heDomingoBogota');

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

/**
 * Recorre [startMs, endMs) por días calendario Bogotá y acumula recargo dom. (diurno/nocturno en las primeras 7,33 h del domingo) y HE diurna/nocturna (resto).
 * @param {number|null} startMs
 * @param {number|null} endMs
 * @returns {{ total: number, horasRecargoDomingo: number, horasRecargoDomingoDiurnas: number, horasRecargoDomingoNocturnas: number, diurnas: number, nocturnas: number }}
 */
function computeHoraExtraSplitBogota(startMs, endMs) {
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

    const recargoOut = { diurnaMs: 0, nocturnaMs: 0 };
    const heOut = { diurnaMs: 0, nocturnaMs: 0 };
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

        if (isSundayBogotaYmd(dayKey)) {
            const rlen = Math.min(e - s, RECARGO_DOMINGO_MAX_MS);
            const after = s + rlen;
            accumulateDiurnaNocturnaInDayWindow(s, after, dayStart, recargoOut);
            if (e > after) accumulateDiurnaNocturnaInDayWindow(after, e, dayStart, heOut);
        } else {
            accumulateDiurnaNocturnaInDayWindow(s, e, dayStart, heOut);
        }
        cursor = e;
    }

    const horasRecargoDomingoDiurnas = Number((recargoOut.diurnaMs / (3600 * 1000)).toFixed(2));
    const horasRecargoDomingoNocturnas = Number((recargoOut.nocturnaMs / (3600 * 1000)).toFixed(2));
    const horasRecargoDomingo = Number((horasRecargoDomingoDiurnas + horasRecargoDomingoNocturnas).toFixed(2));
    const diurnas = Number((heOut.diurnaMs / (3600 * 1000)).toFixed(2));
    const nocturnas = Number((heOut.nocturnaMs / (3600 * 1000)).toFixed(2));
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

/**
 * @param {number} startMs
 * @param {number} endMs
 * @returns {{ diurna: Array<{startMs: number, endMs: number}>, nocturna: Array<{startMs: number, endMs: number}> }}
 */
function collectHeDiurnaNocturnaSegmentsBogota(startMs, endMs) {
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

        if (isSundayBogotaYmd(dayKey)) {
            const rlen = Math.min(e - s, RECARGO_DOMINGO_MAX_MS);
            const after = s + rlen;
            if (e > after) pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, after, e, dayStart);
        } else {
            pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, s, e, dayStart);
        }
        cursor = e;
    }

    return { diurna, nocturna };
}

/**
 * Segmentos del tramo de recargo dominical (primeros L ms del domingo, L ≤ 7,33 h), partidos por franja Bogotá.
 * @param {number} startMs
 * @param {number} endMs
 * @returns {{ diurna: Array<{startMs: number, endMs: number}>, nocturna: Array<{startMs: number, endMs: number}> }}
 */
function collectRecargoDomingoDiurnaNocturnaSegmentsBogota(startMs, endMs) {
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

        if (isSundayBogotaYmd(dayKey)) {
            const rlen = Math.min(e - s, RECARGO_DOMINGO_MAX_MS);
            const after = s + rlen;
            pushDiurnaNocturnaSegmentsForWindow(diurna, nocturna, s, after, dayStart);
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

module.exports = {
    RECARGO_DOMINGO_MAX_HORAS,
    bogotaMinuteOfDayFromMs,
    isDiurnaBogotaMinute,
    computeHoraExtraSplitBogota,
    collectHeDiurnaNocturnaSegmentsBogota,
    collectRecargoDomingoDiurnaNocturnaSegmentsBogota,
    formatHeSegmentRangeBogota,
    formatHeSegmentListBogota
};
