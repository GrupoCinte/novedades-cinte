'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    _liderMatchesServicio,
    _normalizeLideresAsociados
} = require('../src/conciliaciones/serviciosDynamoData');

test('_normalizeLideresAsociados vacío = todos', () => {
    assert.deepEqual(_normalizeLideresAsociados([]), []);
    assert.deepEqual(_normalizeLideresAsociados(null), []);
});

test('_liderMatchesServicio respeta lista de líderes', () => {
    assert.equal(_liderMatchesServicio('Ana', ['Ana', 'Bob']), true);
    assert.equal(_liderMatchesServicio('ana', ['Ana']), true);
    assert.equal(_liderMatchesServicio('Carlos', ['Ana']), false);
    assert.equal(_liderMatchesServicio('Ana', []), true);
    assert.equal(_liderMatchesServicio('', ['Ana']), false);
});
