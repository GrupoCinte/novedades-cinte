const test = require('node:test');
const assert = require('node:assert/strict');
const {
    _normalizeCedulaKey,
    _serviciosMismoCliente,
    _cedulasAsociadasServicio,
    _cedulasOcupadasEnOtrosServicios
} = require('../src/conciliaciones/serviciosDynamoData');

test('consultor ocupado en otro servicio del mismo cliente se detecta por cédula normalizada', () => {
    const servicios = [
        {
            id: 'svc-a',
            entityType: 'SERVICIO',
            client: 'Cliente X',
            consultores_asociados: [{ cedula: '12.345.678' }]
        },
        {
            id: 'svc-b',
            entityType: 'SERVICIO',
            client: 'Cliente X',
            consultores_asociados: []
        },
        {
            id: 'svc-c',
            entityType: 'SERVICIO',
            client: 'Otro Cliente',
            consultores_asociados: [{ cedula: '99.999.999' }]
        }
    ];

    const delCliente = _serviciosMismoCliente(servicios, 'Cliente X');
    assert.equal(delCliente.length, 2);

    const ocupadasParaB = _cedulasOcupadasEnOtrosServicios(delCliente, 'svc-b');
    assert.ok(ocupadasParaB.has('12345678'));
    assert.equal(_cedulasOcupadasEnOtrosServicios(delCliente, 'svc-a').size, 0);
});

test('_normalizeCedulaKey elimina separadores', () => {
    assert.equal(_normalizeCedulaKey('1.234.567'), '1234567');
    assert.equal(_normalizeCedulaKey(''), '');
});

test('_cedulasAsociadasServicio ignora entradas vacías', () => {
    const set = _cedulasAsociadasServicio({
        consultores_asociados: [{ cedula: '111' }, { cedula: '' }, {}]
    });
    assert.deepEqual([...set], ['111']);
});
