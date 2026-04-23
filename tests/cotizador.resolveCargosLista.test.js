const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCargosLista, lookupCargosPorClienteMap } = require('../src/cotizador/resolveCargosLista');

describe('resolveCargosLista', () => {
    const globalCargos = [{ cargo: 'Global', salario: 1 }];

    it('devuelve solo la lista del cliente en cargos_por_cliente', () => {
        const especificos = [{ cargo: 'X', salario: 99 }];
        const out = resolveCargosLista(
            { cargos: globalCargos, cargos_por_cliente: { 'Cliente Uno': especificos } },
            'Cliente Uno'
        );
        assert.deepEqual(out, especificos);
    });

    it('nunca usa catalogos.cargos global (legacy)', () => {
        assert.deepEqual(resolveCargosLista({ cargos: globalCargos }, 'Cualquiera'), []);
        assert.deepEqual(resolveCargosLista({ cargos: globalCargos, cargos_por_cliente: {} }, 'Cualquiera'), []);
        assert.deepEqual(
            resolveCargosLista({ cargos: globalCargos, cargos_por_cliente: { 'Cliente Uno': [] } }, 'Cliente Uno'),
            []
        );
    });

    it('trim en nombre de cliente', () => {
        const especificos = [{ cargo: 'Z', salario: 1 }];
        const out = resolveCargosLista(
            { cargos_por_cliente: { ACME: especificos } },
            '  ACME  '
        );
        assert.deepEqual(out, especificos);
    });

    it('coincidencia por normalización (mayúsculas / variación)', () => {
        const especificos = [{ cargo: 'A', salario: 1 }];
        const out = resolveCargosLista(
            { cargos_por_cliente: { 'Banco XYZ': especificos } },
            'banco xyz'
        );
        assert.deepEqual(out, especificos);
    });
});

describe('lookupCargosPorClienteMap', () => {
    it('lista vacía si mapa inválido', () => {
        assert.deepEqual(lookupCargosPorClienteMap(null, 'A'), []);
        assert.deepEqual(lookupCargosPorClienteMap([], 'A'), []);
    });
});
