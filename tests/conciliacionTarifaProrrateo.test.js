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

test('modo HOURS: horas por días hábiles trabajados (baseHours 160 → 8 h/día)', () => {
    // Salida 15 jun: días hábiles 1–15 (excl. fines de semana) = 11 → 11 × (160/20) = 88 h.
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 3_520_000,
        year: 2026,
        month: 6,
        fechaTermino: '2026-06-15',
        billingMode: 'HOURS',
        baseHours: 160
    });
    assert.equal(r.horasFacturables, 88);
    assert.equal(r.tarifaBase, Math.round(3_520_000 * (88 / 160)));
});

test('modo HOURS: baseHours 180 → 9 h/día laborado, salida 5 jun = 45 h', () => {
    // Jun 1–5 2026 son lunes a viernes: 5 días hábiles × 9 h = 45 h.
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 10_720_200,
        year: 2026,
        month: 6,
        fechaTermino: '2026-06-05',
        billingMode: 'HOURS',
        baseHours: 180
    });
    assert.equal(r.horasFacturables, 45);
    assert.equal(r.tarifaBase, Math.round(10_720_200 * (45 / 180)));
});

test('modo HOURS: mes completo tope en baseHours (= catálogo)', () => {
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 10_720_200,
        year: 2026,
        month: 6,
        billingMode: 'HOURS',
        baseHours: 180
    });
    assert.equal(r.horasFacturables, 180);
    assert.equal(r.tarifaBase, 10_720_200);
    assert.equal(r.prorrateoAplicado, false);
});

test('modo HOURS: mes completo conserva catálogo aunque haya festivos en el mes', () => {
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 10_720_200,
        year: 2026,
        month: 6,
        billingMode: 'HOURS',
        baseHours: 180,
        festivosSet: new Set(['2026-06-02', '2026-06-15', '2026-06-29'])
    });
    assert.equal(r.horasFacturables, 180);
    assert.equal(r.tarifaBase, 10_720_200);
    assert.equal(r.prorrateoAplicado, false);
});

test('modo HOURS: festivos se excluyen solo en mes parcial (salida 5 jun)', () => {
    // Con un festivo el 2 de junio, Jun 1–5 baja de 5 a 4 días hábiles → 36 h.
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 10_720_200,
        year: 2026,
        month: 6,
        fechaTermino: '2026-06-05',
        billingMode: 'HOURS',
        baseHours: 180,
        festivosSet: new Set(['2026-06-02'])
    });
    assert.equal(r.horasFacturables, 36);
    assert.equal(r.tarifaBase, Math.round(10_720_200 * (36 / 180)));
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

test('colaboradorVisibleEnMesSql: activos o inactivos con servicio que se cruza con mes M', () => {
    const sql = colaboradorVisibleEnMesSql('c', 2, 3);
    assert.match(sql, /c\.activo IS NOT FALSE/);
    assert.match(sql, /c\.fecha_termino IS NOT NULL/);
    assert.match(sql, /c\.fecha_termino::date >= make_date\(\$2, \$3, 1\)/);
    assert.match(sql, /c\.fecha_ingreso IS NULL/);
    assert.match(sql, /c\.fecha_ingreso::date <= \(make_date\(\$2, \$3, 1\) \+ INTERVAL '1 month - 1 day'\)::date/);
    assert.doesNotMatch(sql, /fecha_baja_efectiva/);
    assert.doesNotMatch(sql, /COALESCE/);
    assert.doesNotMatch(sql, /EXTRACT\(YEAR/);
    assert.doesNotMatch(sql, /EXTRACT\(MONTH/);
});

test('salida 1 jul cobra 1 día aunque se pase fecha_baja_efectiva 24 jul', () => {
    const d = computeDiasFacturablesMes({
        year: 2026,
        month: 7,
        fechaTermino: '2026-07-01',
        fechaBajaEfectiva: '2026-07-24'
    });
    assert.equal(d.diasFacturables, 1);
    assert.equal(d.daysInMonth, 30);
});

test('julio comercial: mes lleno 30/30', () => {
    const d = computeDiasFacturablesMes({ year: 2026, month: 7 });
    assert.equal(d.diasFacturables, 30);
    assert.equal(d.daysInMonth, 30);
    assert.equal(d.periodEnd, '2026-07-30');
    assert.equal(d.prorrateoAplicado, false);
});

test('julio comercial: término 11 → 11/30', () => {
    const d = computeDiasFacturablesMes({
        year: 2026,
        month: 7,
        fechaTermino: '2026-07-11'
    });
    assert.equal(d.diasFacturables, 11);
    assert.equal(d.daysInMonth, 30);
    const r = resolveTarifaBaseMes({
        tarifaMaestro: 4_000_000,
        year: 2026,
        month: 7,
        fechaTermino: '2026-07-11'
    });
    assert.equal(r.tarifaBase, Math.round((4_000_000 / 30) * 11));
});

test('julio comercial: ingreso 2 → 29/30', () => {
    const d = computeDiasFacturablesMes({
        year: 2026,
        month: 7,
        fechaIngreso: '2026-07-02'
    });
    assert.equal(d.diasFacturables, 29);
    assert.equal(d.daysInMonth, 30);
});

test('julio comercial: término 31 cobra mes lleno 30/30', () => {
    const d = computeDiasFacturablesMes({
        year: 2026,
        month: 7,
        fechaTermino: '2026-07-31'
    });
    assert.equal(d.diasFacturables, 30);
    assert.equal(d.daysInMonth, 30);
    assert.equal(d.prorrateoAplicado, false);
});

test('febrero comercial sigue 28', () => {
    const d = computeDiasFacturablesMes({ year: 2026, month: 2 });
    assert.equal(d.diasFacturables, 28);
    assert.equal(d.daysInMonth, 28);
});
