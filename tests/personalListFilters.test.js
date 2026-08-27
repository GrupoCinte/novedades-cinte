const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const {
    normalizeListFilter,
    optionalStringList,
    optionalEnumList,
    applyLowerInFilter,
    applyExactInFilter
} = require('../src/onboarding/personalListFilters');

describe('personalListFilters AUT-316', () => {
    it('normaliza string, coma y array sin duplicar', () => {
        assert.deepEqual(normalizeListFilter('Falabella'), ['Falabella']);
        assert.deepEqual(normalizeListFilter('Falabella,Bancolombia'), ['Falabella', 'Bancolombia']);
        assert.deepEqual(normalizeListFilter(['Falabella', ' falabella ', '']), ['Falabella']);
        assert.deepEqual(normalizeListFilter(''), []);
        assert.deepEqual(normalizeListFilter(undefined), []);
    });

    it('zod acepta un valor o varios', () => {
        const schema = z.object({ cliente: optionalStringList(500) });
        assert.deepEqual(schema.parse({ cliente: 'A' }).cliente, ['A']);
        assert.deepEqual(schema.parse({ cliente: 'A,B' }).cliente, ['A', 'B']);
        assert.deepEqual(schema.parse({ cliente: ['A', 'B'] }).cliente, ['A', 'B']);
        assert.equal(schema.parse({}).cliente, undefined);
    });

    it('tipo_personal admite varios enums', () => {
        const schema = z.object({
            tipo_personal: optionalEnumList(['consultor', 'staff', 'sena', 'alianza'])
        });
        assert.deepEqual(schema.parse({ tipo_personal: 'staff,sena' }).tipo_personal, ['staff', 'sena']);
        assert.equal(schema.safeParse({ tipo_personal: 'otro' }).success, false);
    });

    it('SQL un valor usa igualdad; varios usa ANY', () => {
        const params = [];
        const where = [];
        let p = applyLowerInFilter('c.cliente', 'Falabella', params, where, 1);
        assert.equal(p, 2);
        assert.equal(where[0], `LOWER(TRIM(COALESCE(c.cliente, ''))) = LOWER($1)`);
        assert.deepEqual(params, ['Falabella']);

        const params2 = [];
        const where2 = [];
        p = applyLowerInFilter('c.tipo_contrato', ['Fijo', 'Indefinido'], params2, where2, 1);
        assert.equal(p, 2);
        assert.equal(where2[0], `LOWER(TRIM(COALESCE(c.tipo_contrato, ''))) = ANY($1::text[])`);
        assert.deepEqual(params2, [['fijo', 'indefinido']]);
    });

    it('tipo_personal exacto con varios valores', () => {
        const params = [];
        const where = [];
        applyExactInFilter('c.tipo_personal', ['consultor', 'staff'], params, where, 3);
        assert.equal(where[0], 'c.tipo_personal = ANY($3::text[])');
        assert.deepEqual(params, [['consultor', 'staff']]);
    });
});
