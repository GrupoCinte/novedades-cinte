const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canActOnEstado,
    resolveNextEstado,
    validateRevisionRequest,
    resolveEffectiveEtapa
} = require('../src/conciliaciones/facturacionRevision');

test('analista puede aprobar PENDIENTE y DEVUELTA pero no rechazar', () => {
    assert.equal(canActOnEstado('analista_conciliaciones', 'PENDIENTE', 'aprobar'), true);
    assert.equal(canActOnEstado('analista_conciliaciones', 'DEVUELTA', 'aprobar'), true);
    assert.equal(canActOnEstado('analista_conciliaciones', 'PENDIENTE', 'rechazar'), false);
    assert.equal(canActOnEstado('analista_conciliaciones', 'APROBADO_ANALISTA', 'aprobar'), false);
});

test('nomina puede aprobar o rechazar APROBADO_ANALISTA', () => {
    assert.equal(canActOnEstado('nomina', 'APROBADO_ANALISTA', 'aprobar'), true);
    assert.equal(canActOnEstado('nomina', 'APROBADO_ANALISTA', 'rechazar'), true);
    assert.equal(canActOnEstado('nomina', 'PENDIENTE', 'aprobar'), false);
});

test('transiciones analista → APROBADO_ANALISTA y nomina → APROBADO_FINANZAS / DEVUELTA', () => {
    const analista = resolveNextEstado('PENDIENTE', 'aprobar', 'ANALISTA');
    assert.equal(analista.ok, true);
    assert.equal(analista.estado, 'APROBADO_ANALISTA');

    const nominaOk = resolveNextEstado('APROBADO_ANALISTA', 'aprobar', 'NOMINA');
    assert.equal(nominaOk.ok, true);
    assert.equal(nominaOk.estado, 'APROBADO_FINANZAS');

    const nominaRech = resolveNextEstado('APROBADO_ANALISTA', 'rechazar', 'NOMINA');
    assert.equal(nominaRech.ok, true);
    assert.equal(nominaRech.estado, 'DEVUELTA');
});

test('validateRevisionRequest exige observación', () => {
    const bad = validateRevisionRequest({
        role: 'analista_conciliaciones',
        estadoActual: 'PENDIENTE',
        accion: 'aprobar',
        observacion: '   '
    });
    assert.equal(bad.ok, false);

    const good = validateRevisionRequest({
        role: 'analista_conciliaciones',
        estadoActual: 'PENDIENTE',
        accion: 'aprobar',
        observacion: 'Revisado OK'
    });
    assert.equal(good.ok, true);
    assert.equal(good.estado, 'APROBADO_ANALISTA');
});

test('super_admin usa etapa según estado actual', () => {
    assert.equal(resolveEffectiveEtapa('super_admin', 'PENDIENTE'), 'ANALISTA');
    assert.equal(resolveEffectiveEtapa('super_admin', 'APROBADO_ANALISTA'), 'NOMINA');
});
