'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('helpers workspace cliente: billing defaults y salidas del mes', async () => {
    const {
        resolveBillingDefaultsForCliente,
        buildCedulasAsignadasCliente,
        enrichRowsClienteWorkspace,
        countSinServicioSalidaMes,
        extractSalidasMesRows
    } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const cola = [
        {
            client: 'BANCO DE BOGOTÁ',
            consultoresCedulas: ['111'],
            billingType: 'CURRENT_MONTH',
            billingMode: 'CALENDAR_DAYS',
            baseHours: 160
        },
        {
            client: 'BANCO DE BOGOTÁ',
            consultoresCedulas: ['222'],
            billingType: 'CURRENT_MONTH',
            billingMode: 'CALENDAR_DAYS',
            baseHours: 160
        }
    ];

    const defaults = resolveBillingDefaultsForCliente(cola, 'banco de bogotá');
    assert.equal(defaults.billingType, 'CURRENT_MONTH');
    assert.equal(defaults.billingMode, 'CALENDAR_DAYS');
    assert.equal(defaults.baseHours, 160);

    const assigned = buildCedulasAsignadasCliente(cola, 'BANCO DE BOGOTÁ');
    assert.ok(assigned.has('111'));
    assert.ok(assigned.has('222'));

    const enriched = enrichRowsClienteWorkspace(
        [
            { cedula: '5617956', activo: false, nombre: 'Xio' },
            { cedula: '111', activo: true, nombre: 'A' }
        ],
        assigned
    );
    assert.equal(enriched[0].salidaMes, true);
    assert.equal(enriched[0].sinServicioAsignado, true);
    assert.equal(enriched[1].salidaMes, false);
    assert.equal(enriched[1].sinServicioAsignado, false);

    assert.equal(countSinServicioSalidaMes(enriched), 1);

    const salidas = extractSalidasMesRows(
        [
            { cedula: '5617956', activoColaborador: false, nombre: 'Xio' },
            { cedula: '111', activoColaborador: true, nombre: 'A' },
            { cedula: '222', activo: false, nombre: 'En otro' }
        ],
        ['222']
    );
    assert.deepEqual(
        salidas.map((r) => r.cedula),
        ['5617956']
    );
});
