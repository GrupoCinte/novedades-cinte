const test = require('node:test');
const assert = require('node:assert');
const { diasHabilesEntre, sumarDiasHabiles } = require('../src/reubicaciones/reubicacionesCalendario');

test('diasHabilesEntre: lunes a viernes sin festivos', async () => {
    const inicio = new Date('2026-08-03'); // lunes
    const fin = new Date('2026-08-07');    // viernes
    const resultado = await diasHabilesEntre(inicio, fin);
    assert.strictEqual(resultado, 5);
});

test('diasHabilesEntre: excluye sábado y domingo', async () => {
    const inicio = new Date('2026-08-03'); // lunes
    const fin = new Date('2026-08-09');    // domingo
    const resultado = await diasHabilesEntre(inicio, fin);
    assert.strictEqual(resultado, 5);
});

test('sumarDiasHabiles: +5 días hábiles desde lunes', async () => {
    const inicio = new Date('2026-08-03');
    const resultado = await sumarDiasHabiles(inicio, 5);
    const esperado = new Date('2026-08-10');
    assert.strictEqual(resultado.toISOString().split('T')[0], esperado.toISOString().split('T')[0]);
});