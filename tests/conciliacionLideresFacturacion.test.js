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
