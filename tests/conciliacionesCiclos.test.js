'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    cutoffCycleDates,
    daysUntilCutoff,
    cutoffLabelFromDays,
    resolvePeriodoForCliente,
    resolveBillingMonthForToday
} = require('../src/conciliaciones/conciliacionesCiclos');
const { computeFacturaCop, aggregateCardState, countConciliados, computeSlaAlert } = require('../src/conciliaciones/facturacionCalculo');

test('cutoffCycleDates día 8 junio 2026', () => {
    const c = cutoffCycleDates({ year: 2026, month: 6, diaCorte: 8 });
    assert.equal(c.start, '2026-05-09');
    assert.equal(c.end, '2026-06-08');
});

test('cutoffCycleDates día 31 marzo (feb corto)', () => {
    const c = cutoffCycleDates({ year: 2026, month: 3, diaCorte: 31 });
    assert.equal(c.end, '2026-03-31');
    assert.equal(c.start, '2026-03-01');
});

test('resolvePeriodoForCliente CALENDARIO_30 usa ciclo', () => {
    const p = resolvePeriodoForCliente({ year: 2026, month: 6, diaCorte: 8, reglaTipo: 'CALENDARIO_30' });
    assert.equal(p.start, '2026-05-09');
    assert.equal(p.end, '2026-06-08');
});

test('resolvePeriodoForCliente MES_CALENDARIO usa mes completo', () => {
    const p = resolvePeriodoForCliente({ year: 2026, month: 6, reglaTipo: 'MES_CALENDARIO' });
    assert.equal(p.start, '2026-06-01');
    assert.equal(p.end, '2026-06-30');
});

test('daysUntilCutoff y cutoffLabelFromDays', () => {
    assert.equal(daysUntilCutoff({ today: '2026-06-08', year: 2026, month: 6, diaCorte: 8 }), 0);
    assert.equal(cutoffLabelFromDays(0), 'Hoy');
    assert.equal(cutoffLabelFromDays(3), 'En 3 días');
});

test('resolveBillingMonthForToday antes y después del corte', () => {
    assert.deepEqual(resolveBillingMonthForToday({ today: '2026-06-05', diaCorte: 8 }), { year: 2026, month: 6 });
    assert.deepEqual(resolveBillingMonthForToday({ today: '2026-06-10', diaCorte: 8 }), { year: 2026, month: 7 });
});

test('computeFacturaCop MES_CALENDARIO legacy', () => {
    const r = computeFacturaCop({ reglaTipo: 'MES_CALENDARIO', tarifa: 1000, sumMonto: 200, periodo: { start: '2026-06-01', end: '2026-06-30' } });
    assert.equal(r.facturaCop, 800);
});

test('computeFacturaCop CALENDARIO_30 prorrateo /30', () => {
    const periodo = cutoffCycleDates({ year: 2026, month: 6, diaCorte: 8 });
    const r = computeFacturaCop({
        reglaTipo: 'CALENDARIO_30',
        tarifa: 3000,
        sumMonto: 0,
        periodo
    });
    assert.ok(r.facturaCop > 0);
    assert.equal(r.desglose.dailyRate, 100);
});

test('aggregateCardState Esperando GO', () => {
    const rows = [{ estado: 'ENVIADA' }, { estado: 'ENVIADA' }];
    const card = aggregateCardState(rows);
    assert.equal(card.estadoTarjeta, 'ENVIADA');
    assert.match(card.estadoTarjetaLabel, /Esperando GO/);
});

test('computeSlaTier con defaults 10/5', () => {
    const { computeSlaTier } = require('../src/conciliaciones/facturacionCalculo');
    assert.equal(computeSlaTier({ daysUntil: 12 }), 'verde');
    assert.equal(computeSlaTier({ daysUntil: 10 }), 'verde');
    assert.equal(computeSlaTier({ daysUntil: 9 }), 'amarillo');
    assert.equal(computeSlaTier({ daysUntil: 5 }), 'amarillo');
    assert.equal(computeSlaTier({ daysUntil: 4 }), 'rojo');
    assert.equal(computeSlaTier({ daysUntil: 0 }), 'rojo');
    assert.equal(computeSlaTier({ daysUntil: -2 }), 'rojo');
});

test('countConciliados y SLA', () => {
    const rows = [{ estado: 'CONCILIADA' }, { estado: 'PENDIENTE' }];
    assert.equal(countConciliados(rows), 1);
    assert.equal(computeSlaAlert({ daysUntil: 4, rows }), true);
    assert.equal(computeSlaAlert({ daysUntil: 5, rows }), false);
    assert.equal(computeSlaAlert({ daysUntil: 4, rows: [{ estado: 'CONCILIADA' }] }), false);
});
