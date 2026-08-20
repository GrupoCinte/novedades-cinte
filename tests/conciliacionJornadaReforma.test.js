'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveJornadaSemanalHoras,
    resolveHorasLaborablesMes,
    lastDayOfMonthYmd
} = require('../src/conciliaciones/conciliacionJornadaReforma');

test('jornada semanal Ley 2101 por fecha de corte', () => {
    assert.equal(resolveJornadaSemanalHoras('2023-07-14'), 48);
    assert.equal(resolveJornadaSemanalHoras('2023-07-15'), 47);
    assert.equal(resolveJornadaSemanalHoras('2024-07-15'), 46);
    assert.equal(resolveJornadaSemanalHoras('2025-07-15'), 44);
    assert.equal(resolveJornadaSemanalHoras('2026-07-14'), 44);
    assert.equal(resolveJornadaSemanalHoras('2026-07-15'), 42);
    assert.equal(resolveJornadaSemanalHoras('2026-07-31'), 42);
});

test('julio 2026 usa último día del mes (31) → 42 h/sem × 23 hábiles', () => {
    assert.equal(lastDayOfMonthYmd(2026, 7), '2026-07-31');
    const horas = resolveHorasLaborablesMes({ year: 2026, month: 7 });
    assert.equal(horas, 193.2);
});

test('junio 2026 aún es 44 h/sem (corte 15 jul)', () => {
    const horas = resolveHorasLaborablesMes({ year: 2026, month: 6 });
    assert.equal(horas, 193.6);
});

test('festivos restan días hábiles del mes', () => {
    const sinFestivos = resolveHorasLaborablesMes({ year: 2026, month: 7 });
    const conFestivos = resolveHorasLaborablesMes({
        year: 2026,
        month: 7,
        festivosSet: new Set(['2026-07-20'])
    });
    assert.equal(sinFestivos, 193.2);
    assert.equal(conFestivos, 184.8);
});
