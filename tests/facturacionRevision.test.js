const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canActOnEstado,
    canActOnEstadoForEtapa,
    resolveNextEstado,
    validateRevisionRequest,
    validateRevisionRequestMasiva,
    resolveEffectiveEtapa
} = require('../src/conciliaciones/facturacionRevision');

test('analista puede aprobar PENDIENTE y DEVUELTA pero no rechazar', () => {
    assert.equal(canActOnEstado('analista_conciliaciones', 'PENDIENTE', 'aprobar'), true);
    assert.equal(canActOnEstado('analista_conciliaciones', 'DEVUELTA', 'aprobar'), true);
    assert.equal(canActOnEstado('analista_conciliaciones', 'PENDIENTE', 'rechazar'), false);
    assert.equal(canActOnEstado('analista_conciliaciones', 'APROBADO_ANALISTA', 'aprobar'), false);
});

test('rol nomina ya no puede aprobar en conciliaciones', () => {
    assert.equal(canActOnEstado('nomina', 'APROBADO_ANALISTA', 'aprobar'), false);
    assert.equal(canActOnEstado('nomina', 'PENDIENTE', 'aprobar'), false);
});

test('transición analista → APROBADO_ANALISTA', () => {
    const analista = resolveNextEstado('PENDIENTE', 'aprobar', 'ANALISTA');
    assert.equal(analista.ok, true);
    assert.equal(analista.estado, 'APROBADO_ANALISTA');

    const nomina = resolveNextEstado('APROBADO_ANALISTA', 'aprobar', 'NOMINA');
    assert.equal(nomina.ok, false);
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

test('super_admin solo actúa en etapa analista para pendientes', () => {
    assert.equal(resolveEffectiveEtapa('super_admin', 'PENDIENTE'), 'ANALISTA');
    assert.equal(resolveEffectiveEtapa('super_admin', 'APROBADO_ANALISTA'), null);
});

test('masiva con etapaObjetivo ANALISTA no promueve filas ya aprobadas', () => {
    assert.equal(canActOnEstadoForEtapa('super_admin', 'PENDIENTE', 'aprobar', 'ANALISTA'), true);
    assert.equal(canActOnEstadoForEtapa('super_admin', 'APROBADO_ANALISTA', 'aprobar', 'ANALISTA'), false);
    assert.equal(canActOnEstadoForEtapa('super_admin', 'APROBADO_ANALISTA', 'aprobar', 'NOMINA'), false);

    const skipAnalista = validateRevisionRequestMasiva({
        role: 'super_admin',
        estadoActual: 'APROBADO_ANALISTA',
        accion: 'aprobar',
        observacion: 'Masivo',
        etapaObjetivo: 'ANALISTA'
    });
    assert.equal(skipAnalista.ok, false);
    assert.equal(skipAnalista.skip, true);

    const okAnalista = validateRevisionRequestMasiva({
        role: 'super_admin',
        estadoActual: 'PENDIENTE',
        accion: 'aprobar',
        observacion: 'Masivo',
        etapaObjetivo: 'ANALISTA'
    });
    assert.equal(okAnalista.ok, true);
    assert.equal(okAnalista.estado, 'APROBADO_ANALISTA');
});
