const test = require('node:test');
const assert = require('node:assert/strict');
const { semaforoFromDiasRestantes } = require('../src/reubicaciones/reubicacionesSemaforo');

test('semaforo: vencido y rangos', () => {
    assert.equal(semaforoFromDiasRestantes(-1), 'Vencido');
    assert.equal(semaforoFromDiasRestantes(0), 'Rojo');
    assert.equal(semaforoFromDiasRestantes(14), 'Rojo');
    assert.equal(semaforoFromDiasRestantes(15), 'Amarillo');
    assert.equal(semaforoFromDiasRestantes(30), 'Amarillo');
    assert.equal(semaforoFromDiasRestantes(31), 'Verde');
    assert.equal(semaforoFromDiasRestantes(100), 'Verde');
});

test('semaforo: no numérico', () => {
    assert.equal(semaforoFromDiasRestantes(null), null);
    assert.equal(semaforoFromDiasRestantes(undefined), null);
    assert.equal(semaforoFromDiasRestantes('x'), null);
});
