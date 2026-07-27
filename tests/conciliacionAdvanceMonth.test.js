'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isAdvanceMonthBilling,
    resolveAdvancePeriods,
    classifyNovedadAdvanceScope,
    aggregateAdvanceFactura,
    shouldSkipAdvanceConsumo,
    resolveSaldoAnticipoTipo
} = require('../src/conciliaciones/conciliacionAdvanceMonth');

test('isAdvanceMonthBilling reconoce ADVANCE_MONTH', () => {
    assert.equal(isAdvanceMonthBilling('ADVANCE_MONTH'), true);
    assert.equal(isAdvanceMonthBilling('EXPIRED_MONTH'), false);
});

test('resolveAdvancePeriods devuelve mes actual y anterior', () => {
    const p = resolveAdvancePeriods(2026, 7);
    assert.deepEqual(p.current, { year: 2026, month: 7 });
    assert.deepEqual(p.adjustment, { year: 2026, month: 6 });
});

test('classifyNovedadAdvanceScope distingue periodo y ajuste', () => {
    const periods = resolveAdvancePeriods(2026, 7);
    assert.equal(
        classifyNovedadAdvanceScope({ fecha_inicio: '2026-06-15' }, periods),
        'ajuste_anticipo'
    );
    assert.equal(
        classifyNovedadAdvanceScope({ fecha_inicio: '2026-07-10' }, periods),
        'periodo_actual'
    );
    assert.equal(classifyNovedadAdvanceScope({ fecha_inicio: '2026-05-10' }, periods), null);
});

test('junio ADVANCE: factura = tarifa plena aunque haya novedades de junio', () => {
    const rows = [
        {
            id: 'a',
            tipo_novedad: 'Incapacidad',
            fecha_inicio: '2026-06-10',
            fecha_fin: '2026-06-11',
            cantidad_horas: 2,
            unidad: 'dias'
        }
    ];
    const out = aggregateAdvanceFactura(10_000_000, rows, {}, { factAnio: 2026, factMes: 6 });
    assert.equal(out.facturaCop, 10_000_000);
    assert.equal(out.novedadesInfoCount, 1);
    assert.equal(out.ajusteAnticipoSumCop, 0);
    assert.equal(out.pendingAdjustmentCount, 1);
});

test('julio ADVANCE: ajuste junio reduce factura (saldo a favor)', () => {
    const rows = [
        {
            id: 'jun',
            tipo_novedad: 'Incapacidad',
            fecha_inicio: '2026-06-10',
            fecha_fin: '2026-06-11',
            cantidad_horas: 2,
            unidad: 'dias'
        },
        {
            id: 'jul',
            tipo_novedad: 'Vacaciones en tiempo',
            fecha_inicio: '2026-07-05',
            fecha_fin: '2026-07-06',
            cantidad_horas: 2,
            unidad: 'dias'
        }
    ];
    const out = aggregateAdvanceFactura(10_000_000, rows, {}, { factAnio: 2026, factMes: 7 });
    assert.ok(out.ajusteAnticipoSumCop > 0, 'deducción junio');
    assert.equal(out.saldoAnticipoTipo, 'favor');
    assert.equal(out.novedadesInfoCount, 1, 'julio informativo');
    assert.equal(out.facturaCop, 10_000_000 - out.ajusteAnticipoSumCop);
});

test('julio ADVANCE: bono junio aumenta factura (saldo en contra)', () => {
    const rows = [
        {
            id: 'b',
            tipo_novedad: 'Bonos',
            fecha_inicio: '2026-06-20',
            monto_cop: '500000'
        }
    ];
    const out = aggregateAdvanceFactura(10_000_000, rows, {}, { factAnio: 2026, factMes: 7 });
    assert.equal(out.ajusteAnticipoSumaCop, 500_000);
    assert.equal(out.saldoAnticipoTipo, 'contra');
    assert.equal(out.facturaCop, 10_500_000);
});

test('resolveSaldoAnticipoTipo', () => {
    assert.equal(resolveSaldoAnticipoTipo(100, 200), 'favor');
    assert.equal(resolveSaldoAnticipoTipo(200, 100), 'contra');
    assert.equal(resolveSaldoAnticipoTipo(100, 100), null);
});

test('shouldSkipAdvanceConsumo omite cuando no hay ajuste del mes anterior', () => {
    const rows = [{ fecha_inicio: '2026-06-10' }];
    assert.equal(shouldSkipAdvanceConsumo('ADVANCE_MONTH', rows, 2026, 6), true);
    const julRows = [{ fecha_inicio: '2026-06-10' }, { fecha_inicio: '2026-07-05' }];
    assert.equal(shouldSkipAdvanceConsumo('ADVANCE_MONTH', julRows, 2026, 7), false);
});
