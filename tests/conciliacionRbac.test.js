'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    canWriteConciliacion,
    isWideConciliacionRole,
    isConciliacionReadOnlyRole,
    canEnviarCorreoConciliacion,
    canMarcarConciliacionServicio,
    canRevertConciliacionCierre,
    resolveConciliacionRevisionEtapa
} = require('../src/conciliaciones/conciliacionRbac');

const { resolveEffectiveEtapa, canRoleActAtEtapa } = require('../src/conciliaciones/facturacionRevision');
const { canEditConciliacionAjustes } = require('../src/conciliaciones/conciliacionAjustes');

test('analista y gp tienen escritura; nomina solo lectura', () => {
    assert.equal(canWriteConciliacion('analista_conciliaciones'), true);
    assert.equal(canWriteConciliacion('gp'), true);
    assert.equal(canWriteConciliacion('nomina'), false);
    assert.equal(isConciliacionReadOnlyRole('nomina'), true);
    assert.equal(isConciliacionReadOnlyRole('gp'), false);
});

test('alcance wide: nomina y analista sí; gp no', () => {
    assert.equal(isWideConciliacionRole('nomina'), true);
    assert.equal(isWideConciliacionRole('analista_conciliaciones'), true);
    assert.equal(isWideConciliacionRole('gp'), false);
});

test('gp y analista actúan en etapa ANALISTA; nomina no', () => {
    assert.equal(resolveConciliacionRevisionEtapa('gp'), 'ANALISTA');
    assert.equal(resolveConciliacionRevisionEtapa('analista_conciliaciones'), 'ANALISTA');
    assert.equal(resolveConciliacionRevisionEtapa('nomina'), null);
    assert.equal(resolveEffectiveEtapa('gp', 'PENDIENTE'), 'ANALISTA');
    assert.equal(resolveEffectiveEtapa('nomina', 'PENDIENTE'), null);
    assert.equal(canRoleActAtEtapa('gp', 'ANALISTA'), true);
    assert.equal(canRoleActAtEtapa('nomina', 'ANALISTA'), false);
});

test('correo / conciliar / revert / ajustes', () => {
    assert.equal(canEnviarCorreoConciliacion('gp'), true);
    assert.equal(canEnviarCorreoConciliacion('nomina'), false);
    assert.equal(canMarcarConciliacionServicio('gp'), true);
    assert.equal(canMarcarConciliacionServicio('nomina'), false);
    assert.equal(canRevertConciliacionCierre('gp'), true);
    assert.equal(canRevertConciliacionCierre('nomina'), false);
    assert.equal(canEditConciliacionAjustes('gp', 'PENDIENTE'), true);
    assert.equal(canEditConciliacionAjustes('nomina', 'PENDIENTE'), false);
});
