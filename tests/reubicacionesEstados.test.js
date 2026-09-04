const test = require('node:test');
const assert = require('node:assert');
const { calcularEstado, ESTADOS } = require('../src/reubicaciones/reubicacionesEstados');

test('calcularEstado: fecha futura devuelve Pendiente', () => {
    const fecha_fin = '2026-09-01';
    const fecha_actual = new Date('2026-08-03');
    const resultado = calcularEstado({ fecha_fin, novedad: null, fecha_actual });
    assert.strictEqual(resultado.estado, ESTADOS.PENDIENTE);
    assert.strictEqual(resultado.motivo, null);
});

test('calcularEstado: misma fecha de término (Día 0) devuelve En Proceso', () => {
    const fecha_fin = '2026-08-03';
    const fecha_actual = new Date('2026-08-03');
    const resultado = calcularEstado({ fecha_fin, novedad: null, fecha_actual });
    assert.strictEqual(resultado.estado, ESTADOS.EN_PROCESO);
    assert.strictEqual(resultado.motivo, null);
});

test('calcularEstado: fecha pasada devuelve En Proceso', () => {
    const fecha_fin = '2026-07-31';
    const fecha_actual = new Date('2026-08-03');
    const resultado = calcularEstado({ fecha_fin, novedad: null, fecha_actual });
    assert.strictEqual(resultado.estado, ESTADOS.EN_PROCESO);
    assert.strictEqual(resultado.motivo, null);
});

test('calcularEstado: con novedad prevalece Con Novedad sin importar la fecha', () => {
    const fecha_fin = '2026-09-01'; // Futura
    const fecha_actual = new Date('2026-08-03');
    const resultado = calcularEstado({ fecha_fin, novedad: 'Falta cliente', fecha_actual });
    assert.strictEqual(resultado.estado, ESTADOS.CON_NOVEDAD);
    assert.strictEqual(resultado.motivo, 'Falta cliente');
});

test('calcularEstado: con fecha inválida devuelve En Proceso por defecto', () => {
    const fecha_fin = 'FechaInvalida';
    const fecha_actual = new Date('2026-08-03');
    const resultado = calcularEstado({ fecha_fin, novedad: null, fecha_actual });
    assert.strictEqual(resultado.estado, ESTADOS.EN_PROCESO);
});
