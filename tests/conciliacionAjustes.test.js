const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveEffectiveTarifa,
    resolveNovedadMontoConAjuste,
    aggregateNovedadesImpactoConAjustes,
    canEditConciliacionAjustes,
    parseAjustesFromFacturacionRow
} = require('../src/conciliaciones/conciliacionAjustes');

test('bono usa monto_cop y override lo reemplaza', () => {
    const row = { id: 'n1', tipo_novedad: 'Bonos', monto_cop: 450_000 };
    const base = resolveNovedadMontoConAjuste(3_000_000, row, {
        tarifaOverride: null,
        montosNovedadOverride: {}
    });
    assert.equal(base.montoCop, 450_000);
    assert.equal(base.montoOrigen, 'novedad');

    const adj = resolveNovedadMontoConAjuste(3_000_000, row, {
        tarifaOverride: null,
        montosNovedadOverride: { n1: 500_000 }
    });
    assert.equal(adj.montoCop, 500_000);
    assert.equal(adj.montoAjustado, true);
});

test('incapacidad calculada recalcula con tarifa override', () => {
    const row = {
        id: 'n2',
        tipo_novedad: 'Incapacidad',
        fecha_inicio: '2026-05-09',
        fecha_fin: '2026-05-10',
        monto_cop: 100
    };
    const sinAdj = resolveNovedadMontoConAjuste(3_000_000, row, {
        tarifaOverride: null,
        montosNovedadOverride: {}
    });
    assert.equal(sinAdj.montoCop, 200_000);

    const conTarifa = resolveNovedadMontoConAjuste(3_000_000, row, {
        tarifaOverride: 3_600_000,
        montosNovedadOverride: {}
    });
    assert.equal(conTarifa.montoCop, 240_000);
});

test('override de monto fijo no recalcula al cambiar tarifa', () => {
    const row = {
        id: 'n2',
        tipo_novedad: 'Incapacidad',
        fecha_inicio: '2026-05-09',
        fecha_fin: '2026-05-10'
    };
    const adj = resolveNovedadMontoConAjuste(3_000_000, row, {
        tarifaOverride: 3_600_000,
        montosNovedadOverride: { n2: 180_000 }
    });
    assert.equal(adj.montoCop, 180_000);
    assert.equal(adj.montoAjustado, true);
});

test('permiso por horas recalcula con baseHours en modo HOURS', () => {
    const row = {
        id: 'n3',
        tipo_novedad: 'Permiso remunerado',
        cantidad_horas: 4,
        unidad: 'horas'
    };
    const sinAdj = resolveNovedadMontoConAjuste(3_520_000, row, {
        tarifaOverride: null,
        montosNovedadOverride: {}
    });
    assert.equal(sinAdj.montoCop, 80_000);

    const conBase = resolveNovedadMontoConAjuste(
        3_520_000,
        row,
        { tarifaOverride: null, montosNovedadOverride: {} },
        { billingMode: 'HOURS', baseHours: 160 }
    );
    assert.equal(conBase.montoCop, 88_000);
    assert.equal(conBase.valorHora, 22_000);
});

test('aggregateNovedadesImpactoConAjustes combina tarifa y novedades', () => {
    const agg = aggregateNovedadesImpactoConAjustes(
        5_000_000,
        [
            { id: 'a', tipo_novedad: 'Bonos', monto_cop: 100_000 },
            {
                id: 'b',
                tipo_novedad: 'Permiso remunerado',
                cantidad_horas: 1,
                unidad: 'dias',
                fecha_inicio: '2026-05-01',
                fecha_fin: '2026-05-01'
            }
        ],
        { tarifaOverride: null, montosNovedadOverride: {} }
    );
    assert.equal(agg.tarifaCliente, 5_000_000);
    assert.equal(agg.novedadesSumaCop, 100_000);
    assert.equal(agg.novedadesSumCop, Math.round(5_000_000 / 30));
    assert.equal(agg.facturaCop, 5_000_000 + 100_000 - Math.round(5_000_000 / 30));
});

test('parseAjustesFromFacturacionRow normaliza JSON', () => {
    const a = parseAjustesFromFacturacionRow({
        tarifa_override: '3200000',
        montos_novedad_override: { abc: 100 }
    });
    assert.equal(a.tarifaOverride, 3_200_000);
    assert.deepEqual(a.montosNovedadOverride, { abc: 100 });
});

test('canEditConciliacionAjustes solo analista y super_admin en PENDIENTE/DEVUELTA', () => {
    assert.equal(canEditConciliacionAjustes('analista_conciliaciones', 'PENDIENTE'), true);
    assert.equal(canEditConciliacionAjustes('super_admin', 'DEVUELTA'), true);
    assert.equal(canEditConciliacionAjustes('nomina', 'PENDIENTE'), false);
    assert.equal(canEditConciliacionAjustes('analista_conciliaciones', 'APROBADO_ANALISTA'), false);
});

test('resolveEffectiveTarifa usa override o maestro', () => {
    assert.equal(resolveEffectiveTarifa(3_000_000, { tarifaOverride: null }), 3_000_000);
    assert.equal(resolveEffectiveTarifa(3_000_000, { tarifaOverride: 3_200_000 }), 3_200_000);
});
