'use strict';

/**
 * Caso Jhosmar Cristina Martínez (CLARO BI/BA): tarifa 13.3M, servicio HOURS baseHours 180.
 * Valida coherencia base (180 h mes completo) + vacaciones (días hábiles × h/día = baseHours/20).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTarifaBaseMes, horasPorDiaLaboral } = require('../src/conciliaciones/conciliacionTarifaProrrateo');
const {
    computeNovedadImpactoMonto
} = require('../src/conciliaciones/conciliacionNovedadImpacto');
const { aggregateNovedadesImpactoConAjustes } = require('../src/conciliaciones/conciliacionAjustes');

const TARIFA_JHOSMAR = 13_300_000;
const BASE_HOURS = 180;
const HOURS_OPTS = { billingMode: 'HOURS', baseHours: BASE_HOURS };

test('Jhosmar jul 2026 mes completo: 180 h base y días hábiles expuestos', () => {
    const prorrateo = resolveTarifaBaseMes({
        tarifaMaestro: TARIFA_JHOSMAR,
        year: 2026,
        month: 7,
        billingMode: 'HOURS',
        baseHours: BASE_HOURS
    });
    assert.equal(prorrateo.horasFacturables, 180);
    assert.equal(prorrateo.tarifaBase, TARIFA_JHOSMAR);
    assert.equal(prorrateo.prorrateoAplicado, false);
    assert.ok(prorrateo.businessDaysFacturables >= 20);
    assert.equal(horasPorDiaLaboral(BASE_HOURS), 9);
});

test('Jhosmar jun 2026 vacaciones 11 d: tarifa catálogo menos deducción por horas', () => {
    const vacRow = {
        id: 'v-jhosmar',
        tipo_novedad: 'Vacaciones en tiempo',
        fecha_inicio: '2026-06-01',
        fecha_fin: '2026-06-17',
        cantidad_horas: 11
    };
    const vac = computeNovedadImpactoMonto(TARIFA_JHOSMAR, vacRow, HOURS_OPTS);
    assert.equal(vac.cantidad, 11);
    assert.equal(vac.cantidadHoras, 99);
    assert.equal(vac.montoCop, 7_315_000);

    const agg = aggregateNovedadesImpactoConAjustes(TARIFA_JHOSMAR, [vacRow], {}, HOURS_OPTS);
    assert.equal(agg.tarifaCliente, TARIFA_JHOSMAR);
    assert.equal(agg.novedadesSumCop, 7_315_000);
    assert.equal(agg.facturaCop, 5_985_000);
});

test('Jhosmar vacaciones 5 días hábiles (6–10 jul 2026) restan con misma h/día que la base', () => {
    const vacRow = {
        tipo_novedad: 'Vacaciones en tiempo',
        fecha_inicio: '2026-07-06',
        fecha_fin: '2026-07-10',
        cantidad_horas: 5
    };
    const vac = computeNovedadImpactoMonto(TARIFA_JHOSMAR, vacRow, HOURS_OPTS);
    assert.equal(vac.medida, 'days');
    assert.equal(vac.cantidad, 5);
    assert.equal(vac.cantidadHoras, 45);
    assert.equal(vac.montoCop, Math.round((TARIFA_JHOSMAR / BASE_HOURS) * 45));

    const agg = aggregateNovedadesImpactoConAjustes(TARIFA_JHOSMAR, [vacRow], {}, HOURS_OPTS);
    assert.equal(agg.tarifaCliente, TARIFA_JHOSMAR);
    assert.equal(agg.novedadesSumCop, vac.montoCop);
    assert.equal(agg.facturaCop, TARIFA_JHOSMAR - vac.montoCop);
});

test('baseHours 160: vacaciones y base usan 8 h/día (no 9 fijo)', () => {
    const opts = { billingMode: 'HOURS', baseHours: 160 };
    const vac = computeNovedadImpactoMonto(
        TARIFA_JHOSMAR,
        {
            tipo_novedad: 'Vacaciones en tiempo',
            fecha_inicio: '2026-07-06',
            fecha_fin: '2026-07-08',
            cantidad_horas: 3
        },
        opts
    );
    assert.equal(vac.cantidadHoras, 24);
    assert.equal(vac.montoCop, Math.round((TARIFA_JHOSMAR / 160) * 24));
});
