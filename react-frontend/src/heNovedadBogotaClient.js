/**
 * Lógica HE Bogotá + fecha/hora civil America/Bogotá (misma semántica que `src/heBogotaSplit.js` y `src/novedadHeTime.js`).
 * Módulo ESM para el bundle de Vite (evita interop CJS).
 */

const MAX_OFFSET_MS = 48 * 60 * 60 * 1000;

function parseTimeToMsFromMidnight(timeRaw) {
    const t = String(timeRaw || '').trim();
    const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(t);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    const s = Number(m[3] || 0);
    const off = ((h * 60 + mi) * 60 + s) * 1000;
    if (!Number.isFinite(off) || off < 0 || off >= MAX_OFFSET_MS) return null;
    return off;
}

const dtfBogotaYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

/** @param {number} ms */
function bogotaDateKeyFromMs(ms) {
    if (!Number.isFinite(ms)) return '';
    return dtfBogotaYmd.format(new Date(ms));
}

/** @param {string} ymd */
function bogotaMidnightUtcMsFromYmd(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return Date.UTC(y, mo - 1, d, 5, 0, 0, 0);
}

/** @param {string} ymd */
function isSundayBogotaYmd(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    const middayBogotaAsUtc = Date.UTC(y, mo - 1, d, 17, 0, 0, 0);
    return new Date(middayBogotaAsUtc).getUTCDay() === 0;
}

export const RECARGO_DOMINGO_MAX_HORAS = 7.33;

const HORA_DIURNA_INICIO_MIN = 6 * 60;
const HORA_DIURNA_FIN_EXCL_MIN = 19 * 60;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RECARGO_DOMINGO_MAX_MS = Math.round(7.33 * 3600 * 1000);

const dtfHm = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

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
    return minuteOfDay >= HORA_DIURNA_INICIO_MIN && minuteOfDay < HORA_DIURNA_FIN_EXCL_MIN;
}

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

function pushMergedSegment(arr, s, e) {
    if (e <= s) return;
    const last = arr[arr.length - 1];
    if (last && last.endMs === s) last.endMs = e;
    else arr.push({ startMs: s, endMs: e });
}

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

export function toUtcMsFromDateAndTime(dateRaw, timeRaw) {
    let datePart = '';
    if (dateRaw instanceof Date) {
        datePart = dateRaw.toISOString().slice(0, 10);
    } else {
        const raw = String(dateRaw || '').trim();
        datePart = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
    }
    const timePart = String(timeRaw || '').trim();
    if (!datePart || !timePart) return null;
    const offset = parseTimeToMsFromMidnight(timePart);
    if (offset == null) return null;
    const day0 = bogotaMidnightUtcMsFromYmd(datePart);
    if (day0 == null) return null;
    return day0 + offset;
}

export function computeHoraExtraSplitBogota(startMs, endMs) {
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

export function collectHeDiurnaNocturnaSegmentsBogota(startMs, endMs) {
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

/** Segmentos del recargo dominical (primeros L ms del domingo, L ≤ 7,33 h), por franja Bogotá. */
export function collectRecargoDomingoDiurnaNocturnaSegmentsBogota(startMs, endMs) {
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

function formatHeSegmentRangeBogota(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return '';
    const inclusiveEndMs = Math.max(startMs, endMs - 1);
    const a = formatBogotaYmdHm(startMs);
    const b = formatBogotaYmdHm(inclusiveEndMs);
    const [da, ta] = a.split('T');
    const [db, tb] = b.split('T');
    if (da === db) return `(${ta.slice(0, 5)}–${tb.slice(0, 5)})`;
    return `(${da} ${ta.slice(0, 5)}–${db} ${tb.slice(0, 5)})`;
}

export function formatHeSegmentListBogota(segments) {
    if (!segments || segments.length === 0) return '—';
    return segments.map((seg) => formatHeSegmentRangeBogota(seg.startMs, seg.endMs)).join('; ');
}

export { bogotaMinuteOfDayFromMs, isDiurnaBogotaMinute };
