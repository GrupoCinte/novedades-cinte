const test = require('node:test');
const assert = require('node:assert/strict');

test('compareCancellationRows: cédula asc/desc numérico y CARGANDO al final', async () => {
    const { compareCancellationRows } = await import('../react-frontend/src/onboarding/cancelacionesSort.js');
    const rows = [
        { executionId: 'e1', cedula: 'CARGANDO' },
        { executionId: 'e2', cedula: '1022375534' },
        { executionId: 'e3', cedula: '1018450282' },
        { executionId: 'e4', cedula: 'CARGANDO' },
        { executionId: 'e5', cedula: '1018450282' }
    ];

    const asc = [...rows].sort((a, b) => compareCancellationRows(a, b, 'cedula', 'asc')).map((r) => r.executionId);
    assert.deepEqual(asc, ['e3', 'e5', 'e2', 'e1', 'e4']);

    const desc = [...rows].sort((a, b) => compareCancellationRows(a, b, 'cedula', 'desc')).map((r) => r.executionId);
    assert.deepEqual(desc, ['e2', 'e3', 'e5', 'e1', 'e4']);
});

test('toggleSort alterna asc/desc en la misma columna', async () => {
    const { toggleSort } = await import('../react-frontend/src/onboarding/onboardingSortDefaults.js');
    assert.deepEqual(toggleSort({ key: 'cedula', dir: 'asc' }, 'cedula'), { key: 'cedula', dir: 'desc' });
    assert.deepEqual(toggleSort({ key: 'cedula', dir: 'desc' }, 'cedula'), { key: 'cedula', dir: 'asc' });
    assert.deepEqual(toggleSort({ key: 'nombre', dir: 'asc' }, 'cedula'), { key: 'cedula', dir: 'asc' });
});

test('mapManualCanceladoRow etiqueta origen manual y no inventa baja', async () => {
    const { mapManualCanceladoRow } = await import('../react-frontend/src/onboarding/cancelacionesFilter.js');
    const row = mapManualCanceladoRow({
        cedula: '1030626734',
        nombre: 'Sharon',
        cliente: 'CINTE',
        puesto: 'Analista',
        fecha_cancelacion: '2026-08-27T14:00:00.000Z',
        fecha_ingreso: '2026-08-01',
        obs_cancelacion: 'no corrió'
    });
    assert.equal(row.origen, 'manual');
    assert.equal(row.status, 'Cancelado');
    assert.equal(row.cedula, '1030626734');
    assert.equal(row.obs_eliminacion, 'no corrió');
});
