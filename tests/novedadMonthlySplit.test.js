const test = require('node:test');
const assert = require('node:assert/strict');
const {
    crossesCalendarMonths,
    shouldSplitNovedadByCalendarMonth,
    splitDateRangeByCalendarMonth,
    computeSegmentCantidadHoras,
    buildSegmentObservacion,
    lastDayOfMonthYmd
} = require('../src/novedadMonthlySplit');

function countCalendarDaysInclusive(startDateRaw, endDateRaw) {
    if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
    const start = new Date(`${startDateRaw}T00:00:00`);
    const end = new Date(`${endDateRaw}T00:00:00`);
    let count = 0;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        count += 1;
    }
    return count;
}

function countBusinessDaysInclusive(startDateRaw, endDateRaw) {
    if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
    const start = new Date(`${startDateRaw}T00:00:00`);
    const end = new Date(`${endDateRaw}T00:00:00`);
    let count = 0;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) count += 1;
    }
    return count;
}

test('crossesCalendarMonths: mismo mes → false', () => {
    assert.equal(crossesCalendarMonths('2026-01-05', '2026-01-31'), false);
});

test('crossesCalendarMonths: meses distintos → true', () => {
    assert.equal(crossesCalendarMonths('2026-01-15', '2026-02-01'), true);
});

test('shouldSplitNovedadByCalendarMonth: solo tipos catalogados', () => {
    assert.equal(shouldSplitNovedadByCalendarMonth('incapacidad', '2026-01-01', '2026-02-01'), true);
    assert.equal(shouldSplitNovedadByCalendarMonth('licencia_maternidad', '2026-01-01', '2026-02-01'), true);
    assert.equal(shouldSplitNovedadByCalendarMonth('permiso_remunerado', '2026-01-01', '2026-02-01'), false);
    assert.equal(shouldSplitNovedadByCalendarMonth('incapacidad', '2026-01-01', '2026-01-31'), false);
});

test('splitDateRangeByCalendarMonth: ene–mar → 3 segmentos', () => {
    const segs = splitDateRangeByCalendarMonth('2026-01-15', '2026-03-10');
    assert.equal(segs.length, 3);
    assert.deepEqual(segs[0], {
        fechaInicio: '2026-01-15',
        fechaFin: '2026-01-31',
        segmentIndex: 1,
        segmentTotal: 3
    });
    assert.deepEqual(segs[1], {
        fechaInicio: '2026-02-01',
        fechaFin: '2026-02-28',
        segmentIndex: 2,
        segmentTotal: 3
    });
    assert.deepEqual(segs[2], {
        fechaInicio: '2026-03-01',
        fechaFin: '2026-03-10',
        segmentIndex: 3,
        segmentTotal: 3
    });
});

test('splitDateRangeByCalendarMonth: 4 meses maternidad (AUT-384 ejemplo)', () => {
    const segs = splitDateRangeByCalendarMonth('2026-01-15', '2026-04-10');
    assert.equal(segs.length, 4);
    assert.equal(segs[0].fechaInicio, '2026-01-15');
    assert.equal(segs[0].fechaFin, '2026-01-31');
    assert.equal(segs[3].fechaInicio, '2026-04-01');
    assert.equal(segs[3].fechaFin, '2026-04-10');
});

test('lastDayOfMonthYmd: febrero bisiesto', () => {
    assert.equal(lastDayOfMonthYmd(2024, 2), '2024-02-29');
    assert.equal(lastDayOfMonthYmd(2026, 2), '2026-02-28');
});

test('computeSegmentCantidadHoras: incapacidad usa días calendario', () => {
    const deps = { countCalendarDaysInclusive, countBusinessDaysInclusive };
    const total = countCalendarDaysInclusive('2026-01-15', '2026-03-10');
    const segs = splitDateRangeByCalendarMonth('2026-01-15', '2026-03-10');
    const sum = segs.reduce(
        (acc, s) => acc + computeSegmentCantidadHoras('incapacidad', s.fechaInicio, s.fechaFin, deps),
        0
    );
    assert.equal(sum, total);
});

test('computeSegmentCantidadHoras: licencia maternidad usa días hábiles', () => {
    const deps = { countCalendarDaysInclusive, countBusinessDaysInclusive };
    const total = countBusinessDaysInclusive('2026-01-15', '2026-03-10');
    const segs = splitDateRangeByCalendarMonth('2026-01-15', '2026-03-10');
    const sum = segs.reduce(
        (acc, s) => acc + computeSegmentCantidadHoras('licencia_maternidad', s.fechaInicio, s.fechaFin, deps),
        0
    );
    assert.equal(sum, total);
});

test('buildSegmentObservacion: anexa trazabilidad', () => {
    assert.equal(
        buildSegmentObservacion(null, 2, 4, '2026-01-15', '2026-04-10'),
        'Segmento 2/4 (radicación original 2026-01-15 — 2026-04-10)'
    );
    assert.equal(
        buildSegmentObservacion('Nota consultor', 1, 2, '2026-01-01', '2026-02-15'),
        'Nota consultor\nSegmento 1/2 (radicación original 2026-01-01 — 2026-02-15)'
    );
});
