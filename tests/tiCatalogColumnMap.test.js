const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMoneyCop, salarioFromCells, cargoLabelFromCells } = require('../src/cotizador/tiCatalogColumnMap');

test.afterEach(() => {
    delete process.env.COTIZADOR_TI_COLUMNA_MAP;
});

test('parseMoneyCop: número JSON positivo', () => {
    assert.equal(parseMoneyCop(4_031_603), 4_031_603);
    assert.equal(parseMoneyCop(4_031_603.12), 4_031_603.12);
    assert.equal(parseMoneyCop(0), 0);
});

test('parseMoneyCop: miles COP con puntos', () => {
    assert.equal(parseMoneyCop('4.031.603'), 4_031_603);
    assert.equal(parseMoneyCop('$ 4.031.603'), 4_031_603);
});

test('parseMoneyCop: decimal con coma (COP)', () => {
    assert.equal(parseMoneyCop('4.031.603,50'), 4_031_603.5);
});

test('parseMoneyCop: estilo US con coma de miles', () => {
    assert.equal(parseMoneyCop('4,031,603.50'), 4_031_603.5);
});

test('salarioFromCells: prioriza Salario asignado y acepta número nativo', () => {
    const n = salarioFromCells({
        'Rol original (Cinte)': 'Dev',
        'Salario asignado': 3_500_000,
        'Base Salarial': ''
    });
    assert.equal(n, 3_500_000);
});

test('salarioFromCells: clave con distinta capitalización', () => {
    const n = salarioFromCells({
        'base salarial': '2.000.000',
        'Rol original (Cinte)': 'X'
    });
    assert.equal(n, 2_000_000);
});

test('salarioFromCells: respaldo Banda Salarial Superior', () => {
    const n = salarioFromCells({
        'Rol original (Cinte)': 'Y',
        'Banda Salarial Superior (COP)': '5.000.000',
        'Salario asignado': '',
        'Base Salarial': ''
    });
    assert.equal(n, 5_000_000);
});

test('cargoLabelFromCells: insensible a mayúsculas en clave', () => {
    const lab = cargoLabelFromCells({
        'rol original (cinte)': 'Líder QA'
    });
    assert.equal(lab, 'Líder QA');
});
