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
