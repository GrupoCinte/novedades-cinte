const test = require('node:test');
const assert = require('node:assert');
const { calcularEstado, ESTADOS } = require('../src/reubicaciones/reubicacionesEstados');

test('calcularEstado: fecha futura → Pendiente', () => {
    const fechaTermino = '2026-09-01';
    const hoy = new Date('2026-08-03');
    const resultado = calcularEstado(fechaTermino, null, hoy);
    assert.strictEqual(resultado.estado, ESTADOS.PENDIENTE);
});

test('calcularEstado: fecha hoy → En proceso, día 0', () => {
    const fechaTermino = '2026-08-03';
    const hoy = new Date('2026-08-03');
    const resultado = calcularEstado(fechaTermino, null, hoy);
    assert.strictEqual(resultado.estado, ESTADOS.EN_PROCESO);
});

test('calcularEstado: con novedad → Con novedad', () => {
    const fechaTermino = '2026-09-01';
    const hoy = new Date('2026-08-03');
    const resultado = calcularEstado(fechaTermino, 'Datos incompletos', hoy);
    assert.strictEqual(resultado.estado, ESTADOS.CON_NOVEDAD);
    assert.strictEqual(resultado.motivo, 'Datos incompletos');
});