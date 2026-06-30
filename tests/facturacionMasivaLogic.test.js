const test = require('node:test');
const assert = require('node:assert/strict');

test('aprobación masiva: filas elegibles por rol y acción', async () => {
    const {
        canUserPerformMasivaRevision,
        filterMasivaEligibleRows,
        resolveMasivaEtapaForRows
    } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const rows = [
        { cedula: '1', estado: 'PENDIENTE' },
        { cedula: '2', estado: 'APROBADO_ANALISTA' },
        { cedula: '3', estado: 'APROBADO_FINANZAS' },
        { cedula: '4', estado: 'DEVUELTA' }
    ];

    assert.equal(canUserPerformMasivaRevision('analista_conciliaciones'), true);
    assert.equal(canUserPerformMasivaRevision('admin_ch'), false);

    const analistaEligible = filterMasivaEligibleRows('analista_conciliaciones', rows, 'aprobar');
    assert.equal(analistaEligible.length, 2);
    assert.equal(resolveMasivaEtapaForRows('analista_conciliaciones', rows, 'aprobar'), 'ANALISTA');

    const nominaEligible = filterMasivaEligibleRows('nomina', rows, 'aprobar');
    assert.equal(nominaEligible.length, 1);
    assert.equal(resolveMasivaEtapaForRows('nomina', rows, 'aprobar'), 'NOMINA');

    assert.equal(resolveMasivaEtapaForRows('super_admin', rows, 'aprobar'), 'ANALISTA');
    assert.equal(resolveMasivaEtapaForRows('super_admin', rows, 'aprobar', 'NOMINA'), 'NOMINA');
});

test('super_admin masiva ANALISTA no incluye filas ya aprobadas por analista', async () => {
    const {
        filterMasivaEligibleRows,
        listMasivaEtapaOptions,
        buildFacturacionRevisionMasivaPayload,
        defaultMasivaEtapaObjetivo
    } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const rows = [
        { cedula: '1', estado: 'PENDIENTE' },
        { cedula: '2', estado: 'APROBADO_ANALISTA' },
        { cedula: '3', estado: 'PENDIENTE' }
    ];

    assert.equal(defaultMasivaEtapaObjetivo('super_admin', rows, 'aprobar'), 'ANALISTA');

    const analistaEligible = filterMasivaEligibleRows('super_admin', rows, 'aprobar', 'ANALISTA');
    assert.equal(analistaEligible.length, 2);
    assert.ok(analistaEligible.every((r) => r.estado === 'PENDIENTE'));

    const nominaEligible = filterMasivaEligibleRows('super_admin', rows, 'aprobar', 'NOMINA');
    assert.equal(nominaEligible.length, 1);
    assert.equal(nominaEligible[0].cedula, '2');

    const options = listMasivaEtapaOptions('super_admin', rows, 'aprobar');
    assert.equal(options.length, 2);

    const built = buildFacturacionRevisionMasivaPayload(
        { accion: 'aprobar', observacion: 'Ok masivo' },
        { cliente: 'Cliente', anio: 2026, mes: 5, cedulas: analistaEligible.map((r) => r.cedula), etapaObjetivo: 'ANALISTA' }
    );
    assert.equal(built.ok, true);
    assert.equal(built.data.etapaObjetivo, 'ANALISTA');
    assert.deepEqual(built.data.cedulas, ['1', '3']);
});

test('canEditConciliacionAjustes y buildFacturacionAjustesPayload', async () => {
    const {
        canEditConciliacionAjustes,
        buildFacturacionAjustesPayload
    } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    assert.equal(canEditConciliacionAjustes('analista_conciliaciones', 'PENDIENTE'), true);
    assert.equal(canEditConciliacionAjustes('cac', 'PENDIENTE'), false);

    const built = buildFacturacionAjustesPayload(
        { observaciones: 'Motivo', cedula: '123', anio: 2026, mes: 5 },
        {
            tarifaDraft: '3200000',
            tarifaEffective: 3000000,
            tarifaMaestro: 3000000,
            montosDraft: { '550e8400-e29b-41d4-a716-446655440001': '500000' },
            items: [
                {
                    id: '550e8400-e29b-41d4-a716-446655440001',
                    montoCop: 450000,
                    montoMaestro: 450000,
                    montoAjustado: false
                }
            ]
        }
    );
    assert.equal(built.ok, true);
    assert.equal(built.data.tarifaOverride, 3200000);
    assert.equal(built.data.montosNovedad.length, 1);
    assert.equal(built.data.montosNovedad[0].montoCop, 500000);
});

test('resolveTarjetaCierreBadge usa estadoServicio, no estadoCola finanzas', async () => {
    const { resolveTarjetaCierreBadge } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const finanzasSinConciliar = resolveTarjetaCierreBadge({
        estadoCola: 'CONCILIADA',
        estadoServicio: 'ENVIADA'
    });
    assert.equal(finanzasSinConciliar.label, 'Enviada');
    assert.equal(finanzasSinConciliar.chipKey, 'SERVICIO_ENVIADA');

    const listoExport = resolveTarjetaCierreBadge({
        estadoCola: 'CONCILIADA',
        estadoServicio: 'LISTO_EXPORT'
    });
    assert.equal(listoExport.label, 'Listo export');

    const conciliada = resolveTarjetaCierreBadge({
        estadoCola: 'CONCILIADA',
        estadoServicio: 'CONCILIADA'
    });
    assert.equal(conciliada.label, 'Conciliada');
});

test('resolveFilaEstadoDisplay hereda Enviada del servicio en filas finanzas', async () => {
    const { resolveFilaEstadoDisplay } = await import('../react-frontend/src/conciliaciones/facturacionLogic.js');

    const enviada = resolveFilaEstadoDisplay('APROBADO_FINANZAS', 'ENVIADA');
    assert.equal(enviada.label, 'Enviada');
    assert.equal(enviada.displayKey, 'SERVICIO_ENVIADA');

    const pendiente = resolveFilaEstadoDisplay('PENDIENTE', 'ENVIADA');
    assert.equal(pendiente.label, 'Pendiente');

    const conciliada = resolveFilaEstadoDisplay('APROBADO_FINANZAS', 'CONCILIADA');
    assert.equal(conciliada.label, 'Conciliada');
});
