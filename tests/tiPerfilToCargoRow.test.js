/**
 * @file Paridad básica perfil TI → fila cargo (SS/prestaciones/aux transporte vs SMMLV).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { perfilFinancieroToCargoRow } = require('../src/cotizador/tiPerfilToCargoRow');

test('perfilFinancieroToCargoRow usa parametros SMMLV y aux legal', () => {
    const parametros = { smmlv: 1_300_000, aux_transporte_legal: 200_000 };
    const row = perfilFinancieroToCargoRow({
        cargoLabel: 'Analista TI',
        salarioBase: 2_000_000,
        equipoTipo: '1',
        parametros
    });
    assert.equal(row.cargo, 'Analista TI');
    assert.equal(row.salario, 2_000_000);
    assert.equal(row.equipo_tipo, '1');
    assert.ok(Number(row.ss) >= 0);
    assert.ok(Number(row.prestaciones) >= 0);
    assert.equal(row.aux_transporte, 200_000);
});

test('perfilFinancieroToCargoRow sin auxilio transporte si salario > 2*SMMLV', () => {
    const parametros = { smmlv: 1_000_000, aux_transporte_legal: 150_000 };
    const row = perfilFinancieroToCargoRow({
        cargoLabel: 'Senior',
        salarioBase: 3_000_000,
        equipoTipo: '2',
        parametros
    });
    assert.equal(row.aux_transporte, 0);
});
