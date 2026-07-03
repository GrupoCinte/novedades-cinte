'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    computeDiasFacturablesMes,
    resolveTarifaBaseMes,
    prorrateTarifaPorDias,
    colaboradorVisibleEnMesSql
} = require('../src/conciliaciones/conciliacionTarifaProrrateo');

test('salida día 15 junio: 15 días facturables de 30', () => {
    const d = computeDiasFacturablesMes({
        year: 2026,
        month: 6,
        fechaTermino: '2026-06-15'
    });
    assert.equal(d.diasFacturables, 15);
    assert.equal(d.daysInMonth, 30);
    assert.equal(d.prorrateoAplicado, true);
});

test('ingreso día 10 junio: 21 días facturables', () => {
    const d = computeDiasFacturablesMes({
        year: 2026,
        month: 6,
        fechaIngreso: '2026-06-10'
    });
    assert.equal(d.diasFacturables, 21);
});

test('tarifa 10M salida 15 jun → 5M base', () => {
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 10_000_000,
        year: 2026,
        month: 6,
        fechaTermino: '2026-06-15'
    });
    assert.equal(r.tarifaBase, 5_000_000);
    assert.equal(r.prorrateoAplicado, true);
});

test('modo HOURS: horas facturables proporcionales', () => {
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 3_520_000,
        year: 2026,
        month: 6,
        fechaTermino: '2026-06-15',
        billingMode: 'HOURS',
        baseHours: 160
    });
    assert.equal(r.horasFacturables, 80);
    assert.equal(r.tarifaBase, 1_760_000);
});

test('tramos mid-mes: 10M hasta 15 y 15M desde 16', () => {
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 10_000_000,
        year: 2026,
        month: 6,
        tramos: [
            { tarifa: 10_000_000, vigente_desde: '2026-06-01', vigente_hasta: '2026-06-15' },
            { tarifa: 15_000_000, vigente_desde: '2026-06-16', vigente_hasta: null }
        ]
    });
    assert.equal(r.tarifaBase, 5_000_000 + 7_500_000);
    assert.equal(r.tramosAplicados.length, 2);
});

test('prorrateTarifaPorDias usa denominador del mes', () => {
    const feb = prorrateTarifaPorDias(3_000_000, 1, 28);
    assert.equal(feb.tarifaProrrateada, Math.round(3_000_000 / 28));
});

test('colaboradorVisibleEnMesSql: activos o inactivos con salida en mes M', () => {
    const sql = colaboradorVisibleEnMesSql('c', 2, 3);
    assert.match(sql, /c\.activo IS NOT FALSE/);
    assert.match(sql, /COALESCE\(c\.fecha_termino, c\.fecha_baja_efectiva\)/);
    assert.match(sql, /\$2::integer/);
    assert.match(sql, /\$3::integer/);
});
