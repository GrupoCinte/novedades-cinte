'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    filterRowsByServicioLideres,
    filterColaCierres,
    normalizeLideresList
} = require('../src/conciliaciones/facturacionAggregate');

test('normalizeLideresList deduplica espacios', () => {
    assert.deepEqual(normalizeLideresList([' Ana ', 'Bob', 'Bob']), ['Ana', 'Bob']);
});

test('filterRowsByServicioLideres vacío = todos', () => {
    const rows = [
        { cedula: '1', lider: 'Ana' },
        { cedula: '2', lider: 'Bob' }
    ];
    assert.equal(filterRowsByServicioLideres(rows, []).length, 2);
    assert.equal(filterRowsByServicioLideres(rows, null).length, 2);
});

test('filterRowsByServicioLideres filtra por líderes del servicio', () => {
    const rows = [
        { cedula: '1', lider: 'Ana' },
        { cedula: '2', lider: 'Bob' }
    ];
    const out = filterRowsByServicioLideres(rows, ['Ana']);
    assert.equal(out.length, 1);
    assert.equal(out[0].cedula, '1');
});

test('filterRowsByServicioLideres mantiene consultores ya asociados al servicio', () => {
    const rows = [
        { cedula: '1', lider: 'Bob' },
        { cedula: '2', lider: 'Ana' }
    ];
    const out = filterRowsByServicioLideres(rows, ['Ana'], ['1']);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((r) => r.cedula), ['1', '2']);
});

test('filterColaCierres combina estado, búsqueda y líder', () => {
    const items = [
        {
            servicioId: 'a',
            client: 'Cliente X',
            serviceName: 'DevOps',
            estadoCola: 'PENDIENTE',
            lideresAsociados: ['Ana'],
            billingMode: 'HOURS',
            billingType: 'EXPIRED_MONTH'
        },
        {
            servicioId: 'b',
            client: 'Cliente Y',
            serviceName: 'Soporte',
            estadoCola: 'CONCILIADA',
            lideresDistintos: ['Bob'],
            billingMode: 'CALENDAR_DAYS',
            billingType: 'CURRENT_MONTH'
        }
    ];
    assert.equal(filterColaCierres(items, { fEstadoCola: 'PENDIENTE' }).length, 1);
    assert.equal(filterColaCierres(items, { fSearchCola: 'devops' }).length, 1);
    assert.equal(filterColaCierres(items, { fLiderCola: 'Bob' }).length, 1);
    assert.equal(filterColaCierres(items, { fBillingMode: 'HOURS' }).length, 1);
});

test('filterColaCierres filtra por estadoServicio', () => {
    const items = [
        { servicioId: '1', estadoServicio: 'EN_REVISION' },
        { servicioId: '2', estadoServicio: 'LISTO_EXPORT' },
        { servicioId: '3', estadoServicio: 'CONCILIADA' }
    ];
    assert.equal(filterColaCierres(items, { fEstadoServicio: 'EN_REVISION' }).length, 1);
    assert.equal(filterColaCierres(items, { fEstadoServicio: 'LISTO_EXPORT' })[0].servicioId, '2');
});

test('filterColaCierres seguimiento Esperando líder y Con devoluciones', () => {
    const items = [
        {
            servicioId: '1',
            estadoServicio: 'ENVIADA',
            emailUsadoAt: null,
            estados: { PENDIENTE: 1 },
            liderDecisiones: { aprobados: 0, rechazados: 0, pendientes: 1 }
        },
        {
            servicioId: '2',
            estadoServicio: 'ENVIADA',
            emailUsadoAt: '2026-07-01T00:00:00.000Z',
            estados: { DEVUELTA: 1 },
            liderDecisiones: { aprobados: 0, rechazados: 1, pendientes: 0 }
        },
        {
            servicioId: '3',
            estadoServicio: 'LISTO_EXPORT',
            emailUsadoAt: null,
            estados: { PENDIENTE: 2 },
            liderDecisiones: null
        }
    ];
    assert.equal(filterColaCierres(items, { fSeguimientoCola: 'ESPERANDO_LIDER' }).length, 1);
    assert.equal(filterColaCierres(items, { fSeguimientoCola: 'ESPERANDO_LIDER' })[0].servicioId, '1');
    assert.equal(filterColaCierres(items, { fSeguimientoCola: 'CON_DEVOLUCIONES' }).length, 1);
    assert.equal(filterColaCierres(items, { fSeguimientoCola: 'CON_DEVOLUCIONES' })[0].servicioId, '2');
});

test('buildSeguimientoEstadoResumen cuenta servicio y consultor', () => {
    const {
        buildSeguimientoEstadoResumen
    } = require('../src/conciliaciones/facturacionAggregate');
    const resumen = buildSeguimientoEstadoResumen([
        {
            estadoServicio: 'ENVIADA',
            emailExpiraAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            emailUsadoAt: null,
            estados: { PENDIENTE: 2, DEVUELTA: 1 }
        },
        {
            estadoServicio: 'CONCILIADA',
            estados: { CONCILIADA: 3 }
        }
    ]);
    assert.equal(resumen.porServicio.ENVIADA, 1);
    assert.equal(resumen.porServicio.CONCILIADA, 1);
    assert.equal(resumen.porConsultor.PENDIENTE, 2);
    assert.equal(resumen.porConsultor.DEVUELTA, 1);
    assert.equal(resumen.esperandoLider, 1);
});
