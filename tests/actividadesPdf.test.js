const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActividadesPdfBuffer } = require('../src/monitoreo/actividadesPdf');

test('buildActividadesPdfBuffer genera PDF vacío con mensaje de sin datos', async () => {
    const buf = await buildActividadesPdfBuffer([], { fechaDesde: '2026-08-01', fechaHasta: '2026-08-31' });
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 0);
    assert.equal(buf.subarray(0, 4).toString('latin1'), '%PDF');
});

test('buildActividadesPdfBuffer incluye una actividad en el PDF', async () => {
    const buf = await buildActividadesPdfBuffer(
        [{
            consultor_nombre: 'Ana Prueba',
            cedula: '10101010',
            cliente: 'CLARO',
            descripcion: 'Soporte de plataforma',
            inicio: '2026-08-10T13:00:00.000Z',
            fin: '2026-08-10T14:30:00.000Z'
        }],
        { fechaDesde: '2026-08-01', fechaHasta: '2026-08-31', cliente: 'CLARO' }
    );
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 80);
    assert.equal(buf.subarray(0, 4).toString('latin1'), '%PDF');
});
