const test = require('node:test');
const assert = require('node:assert/strict');
const {
    aggregateServicioCierre,
    deriveEstadoCola,
    sortColaCierresItems,
    resolveNovedadesBucket
} = require('../src/conciliaciones/facturacionAggregate');

test('aggregateServicioCierre filtra por cédulas y suma totales', () => {
    const rows = [
        { cedula: '123', tarifaCliente: 1000, novedadesSumCop: 100, novedadesSumaCop: 200, facturaCop: 1100, novedadesCount: 1, cerrado: true, estado: 'CONCILIADA' },
        { cedula: '456', tarifaCliente: 2000, novedadesSumCop: 0, novedadesSumaCop: 0, facturaCop: 2000, novedadesCount: 0, cerrado: false, estado: 'PENDIENTE' },
        { cedula: '789', tarifaCliente: 500, novedadesSumCop: 50, novedadesSumaCop: 0, facturaCop: 450, novedadesCount: 1, cerrado: false, estado: 'PENDIENTE' }
    ];
    const agg = aggregateServicioCierre(rows, ['123', '456']);
    assert.equal(agg.consultoresTotal, 2);
    assert.equal(agg.consultoresCerrados, 1);
    assert.equal(agg.consultoresConNovedad, 1);
    assert.equal(agg.totales.tarifaSum, 3000);
    assert.equal(agg.totales.incrementoSum, 200);
    assert.equal(agg.totales.deduccionSum, 100);
    assert.equal(agg.totales.facturaSum, 3100);
    assert.equal(agg.estados.PENDIENTE, 1);
    assert.equal(agg.estados.CONCILIADA, 1);
});

test('aggregateServicioCierre incluye salidas del mes no asociadas en Dynamo', () => {
    const rows = [
        {
            cedula: '123',
            activo: true,
            tarifaCliente: 1000,
            novedadesSumCop: 0,
            novedadesSumaCop: 0,
            facturaCop: 1000,
            novedadesCount: 0,
            cerrado: true,
            estado: 'APROBADO_FINANZAS'
        },
        {
            cedula: '5617956',
            activoColaborador: false,
            tarifaCliente: 500,
            novedadesSumCop: 50,
            novedadesSumaCop: 0,
            facturaCop: 450,
            novedadesCount: 1,
            cerrado: true,
            estado: 'APROBADO_FINANZAS'
        }
    ];
    const agg = aggregateServicioCierre(rows, ['123']);
    assert.equal(agg.consultoresTotal, 2);
    assert.equal(agg.totales.tarifaSum, 1500);
    assert.equal(agg.totales.facturaSum, 1450);
});

test('deriveEstadoCola prioriza sin consultores, devuelta, conciliada y pendiente', () => {
    assert.equal(deriveEstadoCola({ consultoresTotal: 0, consultoresCerrados: 0, estados: {} }), 'SIN_CONSULTORES');
    assert.equal(
        deriveEstadoCola({ consultoresTotal: 2, consultoresCerrados: 1, estados: { DEVUELTA: 1, PENDIENTE: 1 } }),
        'DEVUELTA'
    );
    assert.equal(
        deriveEstadoCola({ consultoresTotal: 2, consultoresCerrados: 2, estados: { CONCILIADA: 2 } }),
        'CONCILIADA'
    );
    assert.equal(
        deriveEstadoCola({ consultoresTotal: 2, consultoresCerrados: 0, estados: { PENDIENTE: 2 } }),
        'PENDIENTE'
    );
    // Flujo solo-analista: todos APROBADO_ANALISTA ⇒ cola lista (CONCILIADA derivada).
    assert.equal(
        deriveEstadoCola({ consultoresTotal: 2, consultoresCerrados: 2, estados: { APROBADO_ANALISTA: 2 } }),
        'CONCILIADA'
    );
});

test('sortColaCierresItems ordena pendientes antes que conciliados', () => {
    const items = sortColaCierresItems([
        { client: 'B', serviceName: 'Z', estadoCola: 'CONCILIADA', consultoresTotal: 2, consultoresCerrados: 2 },
        { client: 'A', serviceName: 'Y', estadoCola: 'PENDIENTE', consultoresTotal: 2, consultoresCerrados: 0 }
    ]);
    assert.equal(items[0].estadoCola, 'PENDIENTE');
    assert.equal(items[1].estadoCola, 'CONCILIADA');
});

test('resolveNovedadesBucket EXPIRED_MONTH retrocede un mes calendario', () => {
    assert.deepEqual(resolveNovedadesBucket(2026, 6, 'EXPIRED_MONTH'), { year: 2026, month: 5 });
    assert.deepEqual(resolveNovedadesBucket(2026, 1, 'EXPIRED_MONTH'), { year: 2025, month: 12 });
    assert.deepEqual(resolveNovedadesBucket(2026, 6, 'ADVANCE_MONTH'), { year: 2026, month: 6 });
    assert.deepEqual(resolveNovedadesBucket(2026, 6, ''), { year: 2026, month: 6 });
});

test('aggregateDashboardFromColaItems agrupa totales por cliente desde servicios', () => {
    const { aggregateDashboardFromColaItems } = require('../src/conciliaciones/facturacionAggregate');
    const out = aggregateDashboardFromColaItems([
        {
            client: 'Cliente A',
            serviceName: 'S1',
            consultoresTotal: 2,
            consultoresConNovedad: 1,
            totales: { tarifaSum: 1000, deduccionSum: 100, facturaSum: 900 }
        },
        {
            client: 'Cliente A',
            serviceName: 'S2',
            consultoresTotal: 1,
            consultoresConNovedad: 0,
            totales: { tarifaSum: 500, deduccionSum: 0, facturaSum: 500 }
        },
        {
            client: 'Cliente B',
            serviceName: 'S3',
            consultoresTotal: 3,
            consultoresConNovedad: 2,
            totales: { tarifaSum: 3000, deduccionSum: 200, facturaSum: 2800 }
        }
    ]);
    assert.equal(out.serviciosCount, 3);
    assert.equal(out.clientesCount, 2);
    assert.equal(out.globalTotales.facturaSum, 900 + 500 + 2800);
    const rowA = out.rows.find((r) => r.cliente === 'Cliente A');
    assert.equal(rowA.serviciosCount, 2);
    assert.equal(rowA.totales.facturaSum, 1400);
    assert.equal(rowA.totales.colaboradores, 3);
});

test('buildColaSaludChartData cuenta servicios por estadoCola', () => {
    const { buildColaSaludChartData } = require('../src/conciliaciones/facturacionAggregate');
    const data = buildColaSaludChartData([
        { estadoCola: 'PENDIENTE' },
        { estadoCola: 'PENDIENTE' },
        { estadoCola: 'CONCILIADA' },
        { estadoCola: 'SIN_CONSULTORES' }
    ]);
    assert.equal(data.length, 3);
    const pend = data.find((d) => d.key === 'PENDIENTE');
    assert.equal(pend.value, 2);
});

test('buildClienteStackedChartData ordena y limita por factura', () => {
    const { buildClienteStackedChartData } = require('../src/conciliaciones/facturacionAggregate');
    const rows = [
        { cliente: 'A', totales: { tarifaSum: 100, deduccionSum: 10, facturaSum: 90 } },
        { cliente: 'B', totales: { tarifaSum: 500, deduccionSum: 0, facturaSum: 500 } },
        { cliente: 'C', totales: { tarifaSum: 300, deduccionSum: 50, facturaSum: 250 } }
    ];
    const data = buildClienteStackedChartData(rows, 2);
    assert.equal(data.length, 2);
    assert.equal(data[0].cliente, 'B');
    assert.equal(data[0].factura, 500);
    assert.equal(data[0].deduccion, 0);
});

test('buildDashboardAlertas clasifica devuelta, sin consultores y cierre vencido', () => {
    const { buildDashboardAlertas } = require('../src/conciliaciones/facturacionAggregate');
    const now = new Date(2026, 5, 20);
    const out = buildDashboardAlertas(
        [
            { estadoCola: 'DEVUELTA', client: 'C1', serviceName: 'S1', consultoresTotal: 2, consultoresCerrados: 2 },
            { estadoCola: 'SIN_CONSULTORES', client: 'C2', serviceName: 'S2', consultoresTotal: 0, consultoresCerrados: 0 },
            {
                estadoCola: 'PENDIENTE',
                client: 'C3',
                serviceName: 'S3',
                closingDay: 10,
                consultoresTotal: 4,
                consultoresCerrados: 1
            },
            {
                estadoCola: 'EN_REVISION',
                client: 'C4',
                serviceName: 'S4',
                closingDay: 25,
                consultoresTotal: 2,
                consultoresCerrados: 0
            }
        ],
        { year: 2026, month: 6, now }
    );
    assert.equal(out.counts.devuelta, 1);
    assert.equal(out.counts.sin_consultores, 1);
    assert.equal(out.counts.cierre_vencido, 1);
    assert.equal(out.counts.bajo_avance, 1);
    assert.equal(out.entries[0].tipo, 'devuelta');
    assert.ok(out.chartData.length >= 3);
});

test('aggregateDashboardFromColaItems: KPIs coinciden con suma directa de totales por servicio', () => {
    const { aggregateDashboardFromColaItems } = require('../src/conciliaciones/facturacionAggregate');
    const items = [
        {
            client: 'Cliente X',
            estadoCola: 'PENDIENTE',
            totales: { tarifaSum: 1_000_000, deduccionSum: 100_000, facturaSum: 900_000 }
        },
        {
            client: 'Cliente X',
            estadoCola: 'CONCILIADA',
            totales: { tarifaSum: 2_000_000, deduccionSum: 0, facturaSum: 2_000_000 }
        },
        {
            client: 'Cliente Y',
            estadoCola: 'EN_REVISION',
            totales: { tarifaSum: 500_000, deduccionSum: 50_000, facturaSum: 450_000 }
        }
    ];
    const direct = items.reduce(
        (acc, it) => ({
            tarifaSum: acc.tarifaSum + (Number(it.totales?.tarifaSum) || 0),
            deduccionSum: acc.deduccionSum + (Number(it.totales?.deduccionSum) || 0),
            facturaSum: acc.facturaSum + (Number(it.totales?.facturaSum) || 0)
        }),
        { tarifaSum: 0, deduccionSum: 0, facturaSum: 0 }
    );
    const agg = aggregateDashboardFromColaItems(items);
    assert.equal(agg.globalTotales.tarifaSum, direct.tarifaSum);
    assert.equal(agg.globalTotales.deduccionSum, direct.deduccionSum);
    assert.equal(agg.globalTotales.facturaSum, direct.facturaSum);
    assert.equal(agg.serviciosCount, items.length);

    const { buildColaSaludChartData } = require('../src/conciliaciones/facturacionAggregate');
    const salud = buildColaSaludChartData(items);
    const saludTotal = salud.reduce((s, d) => s + d.value, 0);
    assert.equal(saludTotal, items.length);
});

test('buildGapCierreChartData suma factura en riesgo por cierre vencido y bajo avance', () => {
    const { buildGapCierreChartData } = require('../src/conciliaciones/facturacionAggregate');
    const now = new Date(2026, 5, 20);
    const out = buildGapCierreChartData(
        [
            { estadoCola: 'CONCILIADA', totales: { facturaSum: 1_000_000 }, consultoresTotal: 2, consultoresCerrados: 2 },
            {
                estadoCola: 'PENDIENTE',
                closingDay: 10,
                totales: { facturaSum: 500_000 },
                consultoresTotal: 4,
                consultoresCerrados: 1
            },
            {
                estadoCola: 'EN_REVISION',
                closingDay: 25,
                totales: { facturaSum: 300_000 },
                consultoresTotal: 2,
                consultoresCerrados: 0
            }
        ],
        { year: 2026, month: 6, now }
    );
    assert.equal(out.facturaTotal, 1_800_000);
    assert.equal(out.facturaEnRiesgo, 800_000);
    assert.equal(out.byTipo.cierre_vencido.factura, 500_000);
    assert.equal(out.byTipo.bajo_avance.factura, 300_000);
});

test('buildParetoIngresosChartData ordena y calcula % acumulado', () => {
    const { buildParetoIngresosChartData } = require('../src/conciliaciones/facturacionAggregate');
    const rows = [
        { cliente: 'A', totales: { facturaSum: 100 } },
        { cliente: 'B', totales: { facturaSum: 300 } },
        { cliente: 'C', totales: { facturaSum: 600 } }
    ];
    const data = buildParetoIngresosChartData(rows, 2);
    assert.equal(data.length, 2);
    assert.equal(data[0].cliente, 'C');
    assert.equal(data[1].cumulativePct, 90);
});

test('buildClienteCierreHeatmapData agrupa factura por cliente y día', () => {
    const { buildClienteCierreHeatmapData } = require('../src/conciliaciones/facturacionAggregate');
    const out = buildClienteCierreHeatmapData([
        { client: 'Cliente A', closingDay: 10, totales: { facturaSum: 100 } },
        { client: 'Cliente A', closingDay: 15, totales: { facturaSum: 200 } },
        { client: 'Cliente B', closingDay: 10, totales: { facturaSum: 50 } }
    ]);
    assert.deepEqual(out.days, [10, 15]);
    assert.equal(out.rows.length, 2);
    assert.equal(out.rows[0].cliente, 'Cliente A');
    const day10A = out.rows[0].cells.find((c) => c.day === 10);
    assert.equal(day10A.value, 100);
});
