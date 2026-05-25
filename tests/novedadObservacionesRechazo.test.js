const test = require('node:test');
const assert = require('node:assert/strict');
const { validateObservacionesRechazo, MAX_OBSERVACIONES_LEN } = require('../src/novedadPersistValidation');

test('validateObservacionesRechazo rechaza vacío', () => {
  const r = validateObservacionesRechazo('   ');
  assert.equal(r.ok, false);
});

test('validateObservacionesRechazo acepta texto válido', () => {
  const r = validateObservacionesRechazo('  Motivo claro.  ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'Motivo claro.');
});

test('validateObservacionesRechazo rechaza exceso de longitud', () => {
  const r = validateObservacionesRechazo('x'.repeat(MAX_OBSERVACIONES_LEN + 1));
  assert.equal(r.ok, false);
});
