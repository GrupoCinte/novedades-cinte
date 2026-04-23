const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    foldForMatch,
    buildFoldToCanonicoMap,
    matchExcelClienteABd,
    lookupCargosPorClienteMap
} = require('../src/cotizador/clienteNombreMatch');

describe('foldForMatch', () => {
    it('colapsa espacios y compara sin acentos', () => {
        assert.equal(foldForMatch('  Banco   BBVA  '), foldForMatch('banco bbva'));
        assert.equal(foldForMatch('Colómbia'), foldForMatch('colombia'));
    });
});

describe('matchExcelClienteABd', () => {
    it('empareja variación Excel con nombre en BD', () => {
        const { map } = buildFoldToCanonicoMap(['Banco Popular', 'CINTE']);
        assert.equal(matchExcelClienteABd('  banco popular ', map), 'Banco Popular');
        assert.equal(matchExcelClienteABd('cinte', map), 'CINTE');
        assert.equal(matchExcelClienteABd('NO EXISTE', map), null);
    });
});

describe('lookupCargosPorClienteMap', () => {
    it('encuentra por clave canónica o por variación', () => {
        const cargos = [{ cargo: 'Dev', salario: 1 }];
        const payload = { 'Banco XYZ': cargos };
        assert.deepEqual(lookupCargosPorClienteMap(payload, 'Banco XYZ'), cargos);
        assert.deepEqual(lookupCargosPorClienteMap(payload, '  banco xyz'), cargos);
        assert.deepEqual(lookupCargosPorClienteMap(payload, 'BANCO Xyz'), cargos);
    });
});
