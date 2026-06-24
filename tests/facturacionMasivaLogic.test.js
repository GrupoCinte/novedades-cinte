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

    assert.equal(resolveMasivaEtapaForRows('super_admin', rows, 'aprobar'), 'MIXED');
});
