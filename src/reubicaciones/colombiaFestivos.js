'use strict';

function parseDateOnly(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function toYmd(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function getFestivosColombia(year) {
    const set = new Set();
    const domingoRamos = addDays(easterSunday(year), -7);
    const juevesSanto = addDays(easterSunday(year), -3);
    const viernesSanto = addDays(easterSunday(year), -2);
    const ascension = addDays(easterSunday(year), 39);
    const corpusChristi = addDays(easterSunday(year), 60);
    const sagradoCorazon = addDays(easterSunday(year), 68);

    const fixed = [
        '01-01',
        '03-19',
        '05-01',
        '06-29',
        '07-20',
        '08-07',
        '11-01',
        '12-08',
        '12-25'
    ];

    for (const item of fixed) {
        const [month, day] = item.split('-').map(Number);
        set.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }

    set.add(toYmd(domingoRamos));
    set.add(toYmd(juevesSanto));
    set.add(toYmd(viernesSanto));
    set.add(toYmd(ascension));
    set.add(toYmd(corpusChristi));
    set.add(toYmd(sagradoCorazon));

    return set;
}

function isFestivoColombia(value, yearHint = null) {
    const date = parseDateOnly(value);
    if (!date) return false;
    const year = yearHint || date.getFullYear();
    const holidays = getFestivosColombia(year);
    const ymd = toYmd(date);
    return holidays.has(ymd) || [0, 6].includes(date.getDay());
}

function getDiasHabilesColombia(fechaInicio, fechaFin, holidaySet = null) {
    const inicio = parseDateOnly(fechaInicio);
    const fin = parseDateOnly(fechaFin);
    if (!inicio || !fin || fin < inicio) return 0;

    const set = holidaySet || getFestivosColombia(inicio.getFullYear());
    let count = 0;
    for (let cursor = new Date(inicio); cursor <= fin; cursor.setDate(cursor.getDate() + 1)) {
        const ymd = toYmd(cursor);
        if (cursor.getDay() === 0 || cursor.getDay() === 6) continue;
        if (set.has(ymd)) continue;
        count += 1;
    }

    return count;
}

module.exports = {
    getFestivosColombia,
    isFestivoColombia,
    getDiasHabilesColombia,
    toYmd,
    parseDateOnly
};
