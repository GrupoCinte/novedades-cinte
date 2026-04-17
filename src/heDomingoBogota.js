'use strict';

/**
 * @param {number} ms
 * @returns {string} YYYY-MM-DD en calendario America/Bogota
 */
function bogotaDateKeyFromMs(ms) {
    if (!Number.isFinite(ms)) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(ms));
}

/**
 * Inicio del día calendario Bogotá (00:00) como instante UTC.
 * @param {string} ymd YYYY-MM-DD (interpretado como fecha Bogotá)
 */
function bogotaMidnightUtcMsFromYmd(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return Date.UTC(y, mo - 1, d, 5, 0, 0, 0);
}

/**
 * @param {string} ymd YYYY-MM-DD (fecha Bogotá)
 * @returns {boolean}
 */
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

/**
 * Prorratea horas entre medianoches America/Bogota (días de 24h fijas).
 * @param {number|null} startMs
 * @param {number|null} endMs
 * @returns {Map<string, number>} YYYY-MM-DD Bogotá -> horas
 */
function splitHoursByBogotaDay(startMs, endMs) {
    const byDay = new Map();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return byDay;
    let cursor = startMs;
    while (cursor < endMs) {
        const dateKey = bogotaDateKeyFromMs(cursor);
        const dayStart = bogotaMidnightUtcMsFromYmd(dateKey);
        if (dayStart == null) break;
        const nextDayStart = dayStart + 24 * 60 * 60 * 1000;
        const segmentEnd = Math.min(endMs, nextDayStart);
        const hours = (segmentEnd - cursor) / (1000 * 60 * 60);
        if (hours > 0) {
            byDay.set(dateKey, (byDay.get(dateKey) || 0) + hours);
        }
        cursor = segmentEnd;
    }
    return byDay;
}

/**
 * @param {string} monthKey YYYY-MM
 * @param {number} tier2 | 3
 * @param {number} sundayDistinctCount
 * @param {string[]} sundayDatesSorted
 */
function buildHeDomingoPolicyText(monthKey, tier, sundayDistinctCount, sundayDatesSorted) {
    const fechas = Array.isArray(sundayDatesSorted) && sundayDatesSorted.length
        ? sundayDatesSorted.join(', ')
        : '—';
    if (tier === 2) {
        return (
            `Hora Extra en domingo (${monthKey}): el consultor acumula ${sundayDistinctCount} domingos distintos reportados con HE; `
            + 'aplica coeficiente 0,80 y compensación de 1 día de descanso en la misma semana. '
            + `Domingos con reporte: ${fechas}.`
        );
    }
    if (tier === 3) {
        return (
            `Hora Extra en domingo (${monthKey}): el consultor acumula ${sundayDistinctCount} domingos distintos reportados con HE; `
            + 'aplica coeficiente 1,80. '
            + `Domingos con reporte: ${fechas}.`
        );
    }
    return '';
}

/**
 * @param {number} distinctSundayCount
 * @returns {0|2|3}
 */
function sundayTierFromCount(distinctSundayCount) {
    const n = Number(distinctSundayCount || 0);
    if (n < 2) return 0;
    if (n === 2) return 2;
    return 3;
}

/**
 * @param {Map<string, Set<string>>} sundaySets keys consultantKey@@@YYYY-MM -> Set of Sunday YYYY-MM-DD
 * @param {string} consultantKey
 * @param {string} monthKey YYYY-MM
 * @returns {{ count: number, tier: 0|2|3, dates: string[] }}
 */
function sundayStatsForConsultantMonth(sundaySets, consultantKey, monthKey) {
    const bucket = `${consultantKey}@@@${monthKey}`;
    const set = sundaySets.get(bucket);
    const dates = set ? Array.from(set).sort() : [];
    const count = dates.length;
    return { count, tier: sundayTierFromCount(count), dates };
}

/**
 * Día calendario America/Bogota para fallback cuando no hay franja horaria válida.
 * Evita usar solo toISOString() (día UTC), que desalinea con splitHoursByBogotaDay.
 * @param {object} row
 * @returns {string} YYYY-MM-DD o ''
 */
function resolveFallbackBogotaYmdFromRow(row) {
    if (row?.fecha_inicio instanceof Date) {
        const k = bogotaDateKeyFromMs(row.fecha_inicio.getTime());
        return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : '';
    }
    const fechaInicioRaw = String(row?.fecha_inicio || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(fechaInicioRaw)) return fechaInicioRaw.slice(0, 10);
    if (row?.creado_en instanceof Date) {
        const k = bogotaDateKeyFromMs(row.creado_en.getTime());
        return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : '';
    }
    const creadoRaw = String(row?.creado_en || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(creadoRaw)) return creadoRaw.slice(0, 10);
    return '';
}

/**
 * @param {object} row novedades row
 * @param {{ toUtcMsFromDateAndTime: Function, resolveFallbackDateKeyFromRow?: Function }} dep
 */
function resolveHourSplitBogotaForRow(row, dep) {
    const startMs = dep.toUtcMsFromDateAndTime(row?.fecha_inicio, row?.hora_inicio);
    const endMs = dep.toUtcMsFromDateAndTime(row?.fecha_fin, row?.hora_fin);
    let daySplit = splitHoursByBogotaDay(startMs, endMs);
    if (daySplit.size === 0) {
        const fallback = resolveFallbackBogotaYmdFromRow(row);
        if (fallback) {
            daySplit = new Map([[fallback, Number(row?.cantidad_horas || 0)]]);
        }
    }
    return daySplit;
}

/**
 * @param {object[]} rows todas las HE en scope (cualquier estado) para contar domingos reportados
 * @param {Function} buildConsultantKey
 * @param {{ toUtcMsFromDateAndTime: Function, resolveFallbackDateKeyFromRow: Function }} dep
 * @returns {Map<string, Set<string>>}
 */
function buildSundayReportedSetsFromHeRows(rows, buildConsultantKey, dep) {
    const sundaySets = new Map();
    for (const row of rows) {
        const ck = buildConsultantKey(row);
        const bog = resolveHourSplitBogotaForRow(row, dep);
        for (const [dayKey, h] of bog) {
            if (!Number.isFinite(h) || h <= 0) continue;
            if (!isSundayBogotaYmd(dayKey)) continue;
            const monthKey = dayKey.slice(0, 7);
            const bucket = `${ck}@@@${monthKey}`;
            if (!sundaySets.has(bucket)) sundaySets.set(bucket, new Set());
            sundaySets.get(bucket).add(dayKey);
        }
    }
    return sundaySets;
}

/**
 * Texto para Excel / UI cuando aplica política domingo (tier ≥ 2).
 */
function computeHeDomingoObservacionForRow(row, sundaySets, buildConsultantKey, dep) {
    const ck = buildConsultantKey(row);
    const bog = resolveHourSplitBogotaForRow(row, dep);
    const monthChunks = new Map();
    for (const [dayKey, h] of bog) {
        if (!Number.isFinite(h) || h <= 0) continue;
        if (!isSundayBogotaYmd(dayKey)) continue;
        const monthKey = dayKey.slice(0, 7);
        const st = sundayStatsForConsultantMonth(sundaySets, ck, monthKey);
        if (st.tier < 2) continue;
        if (!monthChunks.has(monthKey)) monthChunks.set(monthKey, st);
    }
    if (!monthChunks.size) return '';
    const texts = [...monthChunks.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mk, st]) => buildHeDomingoPolicyText(mk, st.tier, st.count, st.dates));
    return texts.join(' || ');
}

module.exports = {
    bogotaDateKeyFromMs,
    bogotaMidnightUtcMsFromYmd,
    isSundayBogotaYmd,
    splitHoursByBogotaDay,
    buildHeDomingoPolicyText,
    sundayTierFromCount,
    sundayStatsForConsultantMonth,
    resolveFallbackBogotaYmdFromRow,
    resolveHourSplitBogotaForRow,
    buildSundayReportedSetsFromHeRows,
    computeHeDomingoObservacionForRow
};
