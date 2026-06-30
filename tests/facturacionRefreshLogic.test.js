const test = require('node:test');
const assert = require('node:assert/strict');

test('resolveRefreshTargets: workspace sin refetch en revisión/masiva', async () => {
    const { resolveRefreshTargets } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: true, mutationKind: 'revision' }), {
        resumen: false,
        cola: false,
        resumenSilent: false,
        colaBackground: false
    });
    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: true, mutationKind: 'masiva' }), {
        resumen: false,
        cola: false,
        resumenSilent: false,
        colaBackground: false
    });
});

test('resolveRefreshTargets: ajustes/revert en workspace refrescan resumen silencioso', async () => {
    const { resolveRefreshTargets } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: true, mutationKind: 'ajustes' }), {
        resumen: true,
        cola: false,
        resumenSilent: true,
        colaBackground: false
    });
    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: true, mutationKind: 'revert' }), {
        resumen: true,
        cola: false,
        resumenSilent: true,
        colaBackground: false
    });
});

test('resolveRefreshTargets: vista cola y cambio estado servicio', async () => {
    const { resolveRefreshTargets } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: false, mutationKind: 'revision' }), {
        resumen: false,
        cola: false,
        resumenSilent: false,
        colaBackground: false
    });
    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: false }), {
        resumen: false,
        cola: true,
        resumenSilent: false,
        colaBackground: false
    });
    assert.deepEqual(resolveRefreshTargets({ hasServicioSel: true, mutationKind: 'servicio_estado' }), {
        resumen: false,
        cola: true,
        resumenSilent: false,
        colaBackground: true
    });
});

test('shouldShowTablaInitialLoading: stale-while-revalidate', async () => {
    const { shouldShowTablaInitialLoading } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    assert.equal(shouldShowTablaInitialLoading({ loadingResumen: true, refreshingResumen: false, rowCount: 0 }), true);
    assert.equal(shouldShowTablaInitialLoading({ loadingResumen: true, refreshingResumen: true, rowCount: 0 }), false);
    assert.equal(shouldShowTablaInitialLoading({ loadingResumen: true, refreshingResumen: false, rowCount: 5 }), false);
    assert.equal(shouldShowTablaInitialLoading({ loadingResumen: false, refreshingResumen: true, rowCount: 5 }), false);
});

test('patchFacturacionRowEstado y resolveEstadoTrasRevisionIndividual', async () => {
    const {
        patchFacturacionRowEstado,
        resolveEstadoTrasRevisionIndividual
    } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const rows = [
        { cedula: '123', estado: 'PENDIENTE' },
        { cedula: '456', estado: 'APROBADO_ANALISTA' }
    ];

    assert.equal(resolveEstadoTrasRevisionIndividual('PENDIENTE', 'aprobar'), 'APROBADO_ANALISTA');
    assert.equal(resolveEstadoTrasRevisionIndividual('APROBADO_ANALISTA', 'aprobar'), 'APROBADO_FINANZAS');
    assert.equal(resolveEstadoTrasRevisionIndividual('APROBADO_ANALISTA', 'rechazar'), 'DEVUELTA');

    const patched = patchFacturacionRowEstado(rows, '123', 'APROBADO_ANALISTA');
    assert.equal(patched[0].estado, 'APROBADO_ANALISTA');
    assert.equal(patched[1].estado, 'APROBADO_ANALISTA');
});

test('patchFacturacionRowsMasivaAprobar por etapa', async () => {
    const { patchFacturacionRowsMasivaAprobar } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const rows = [
        { cedula: '1', estado: 'PENDIENTE' },
        { cedula: '2', estado: 'APROBADO_ANALISTA' },
        { cedula: '3', estado: 'PENDIENTE' }
    ];

    const analista = patchFacturacionRowsMasivaAprobar(rows, ['1', '3'], 'ANALISTA');
    assert.equal(analista[0].estado, 'APROBADO_ANALISTA');
    assert.equal(analista[1].estado, 'APROBADO_ANALISTA');
    assert.equal(analista[2].estado, 'APROBADO_ANALISTA');

    const nomina = patchFacturacionRowsMasivaAprobar(rows, ['2'], 'NOMINA');
    assert.equal(nomina[1].estado, 'APROBADO_FINANZAS');
});

test('mergeServicioInList: insert, update y delete', async () => {
    const { mergeServicioInList } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const base = [{ id: 'a', serviceName: 'Uno' }];

    const inserted = mergeServicioInList(base, { id: 'b', serviceName: 'Dos' });
    assert.equal(inserted.length, 2);

    const updated = mergeServicioInList(inserted, { id: 'a', serviceName: 'Uno editado' });
    assert.equal(updated[0].serviceName, 'Uno editado');
    assert.equal(updated.length, 2);

    const removed = mergeServicioInList(updated, null, { removedId: 'b' });
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, 'a');
});
