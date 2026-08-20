'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    lookupWriteAlias,
    resolveClienteOnWrite,
    sameClienteLabel
} = require('../src/clientes/clienteCanonWrite');

const CANON = [
    'IBM Colombia',
    'FALABELLA BANCO',
    'PORVENIR',
    'EXPERIAN',
    'EXPERIAN CHILE',
    'EXPERIAN PERU',
    'SODIMAC',
    'ALFA',
    'AGENCIA DE SEGUROS FALABELLA',
    'KYNDRYL',
    'AVC',
    'DALE',
    'DIRECTV CHILE',
    'DIRECTV PERU',
    'FALABELLA RETAIL',
    'BANCO DE OCCIDENTE',
    'CONSORCIO'
];

describe('lookupWriteAlias', () => {
    it('mapea razones sociales Zoho al canónico', () => {
        assert.equal(lookupWriteAlias('IBM DE COLOMBIA S.A.'), 'IBM Colombia');
        assert.equal(lookupWriteAlias('banco falabella'), 'FALABELLA BANCO');
        assert.equal(lookupWriteAlias('FONDOS DE PENSIONES Y CESANTIAS PORVENIR'), 'PORVENIR');
        assert.equal(lookupWriteAlias('EXPERIAN COLOMBIA'), 'EXPERIAN');
        assert.equal(lookupWriteAlias('SODIMAC COLOMBIA S.A.'), 'SODIMAC');
        assert.equal(lookupWriteAlias('Seguros ALFA'), 'ALFA');
        assert.equal(lookupWriteAlias('AGENCIA DE SEGUROS FALABELLA LTDA'), 'AGENCIA DE SEGUROS FALABELLA');
        assert.equal(lookupWriteAlias('DIRECT TV CHILE'), 'DIRECTV CHILE');
        assert.equal(lookupWriteAlias('Porvenir - AVAL'), 'PORVENIR');
    });

    it('no mapea Falabella a secas ni países Experian', () => {
        assert.equal(lookupWriteAlias('Falabella'), null);
        assert.equal(lookupWriteAlias('FALABELLA'), null);
        assert.equal(lookupWriteAlias('EXPERIAN CHILE'), null);
        assert.equal(lookupWriteAlias('EXPERIAN PERU'), null);
        assert.equal(lookupWriteAlias('COMPENSAR SALUD'), null);
    });
});

describe('resolveClienteOnWrite', () => {
    it('devuelve el string exacto del catálogo por fold o alias', () => {
        assert.equal(resolveClienteOnWrite('ibm colombia', CANON), 'IBM Colombia');
        assert.equal(resolveClienteOnWrite('IBM DE COLOMBIA S.A.', CANON), 'IBM Colombia');
        assert.equal(resolveClienteOnWrite('BANCO FALABELLA', CANON), 'FALABELLA BANCO');
        assert.equal(resolveClienteOnWrite('experian chile', CANON), 'EXPERIAN CHILE');
        assert.equal(resolveClienteOnWrite('  Banco   de  Bogotá  ', ['BANCO DE BOGOTÁ']), 'BANCO DE BOGOTÁ');
    });

    it('deja Falabella genérico y desconocidos sin inventar', () => {
        assert.equal(resolveClienteOnWrite('Falabella', CANON), 'Falabella');
        assert.equal(resolveClienteOnWrite('COMPENSAR SALUD', CANON), 'COMPENSAR SALUD');
        assert.equal(resolveClienteOnWrite(''), '');
    });
});

describe('sameClienteLabel', () => {
    it('iguala alias Zoho con el canónico sin cruzar Falabella ni Experian país', () => {
        assert.equal(sameClienteLabel('DIRECT TV CHILE', 'DIRECTV CHILE'), true);
        assert.equal(sameClienteLabel('EXPERIAN COLOMBIA', 'EXPERIAN'), true);
        assert.equal(sameClienteLabel('EXPERIAN CHILE', 'EXPERIAN'), false);
        assert.equal(sameClienteLabel('Falabella', 'FALABELLA RETAIL'), false);
    });
});
