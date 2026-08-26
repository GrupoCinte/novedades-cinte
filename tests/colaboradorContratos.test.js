const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    decideContractAction,
    filterExtendedForAction,
    filterContratosByClientes,
    sameCliente,
    isoDate
} = require('../src/onboarding/colaboradorContratos');

describe('decideContractAction AUT-313', () => {
    it('primera ficha inserta el contrato cabecera', () => {
        assert.equal(
            decideContractAction({ exists: false, activo: true, clienteNuevo: 'EXPERIAN' }),
            'insert_first'
        );
    });

    it('mismo cliente activo extiende el término', () => {
        assert.equal(
            decideContractAction({
                exists: true,
                activo: true,
                clienteActual: 'Experian',
                clienteNuevo: 'EXPERIAN'
            }),
            'extend'
        );
    });

    it('otro cliente no pisa la cabecera: contrato nuevo vigente', () => {
        assert.equal(
            decideContractAction({
                exists: true,
                activo: true,
                clienteActual: 'EXPERIAN',
                clienteNuevo: 'DAVIVIENDA'
            }),
            'new_client'
        );
    });

    it('reingreso reactiva y manda el viejo a histórico', () => {
        assert.equal(
            decideContractAction({
                exists: true,
                activo: false,
                clienteActual: 'EXPERIAN',
                clienteNuevo: 'DAVIVIENDA'
            }),
            'reingreso'
        );
    });

    it('sin cliente nuevo no toca contratos', () => {
        assert.equal(
            decideContractAction({ exists: true, activo: true, clienteActual: 'EXPERIAN' }),
            'identity_only'
        );
    });
});

describe('filterExtendedForAction AUT-313', () => {
    it('en cliente nuevo no pisa campos de contrato de la persona', () => {
        const filtered = filterExtendedForAction(
            { cliente: 'DAVIVIENDA', fecha_termino: '2026-12-01', eps: 'SURA', nombre: 'Ana' },
            'new_client'
        );
        assert.equal(filtered.cliente, undefined);
        assert.equal(filtered.fecha_termino, undefined);
        assert.equal(filtered.eps, 'SURA');
        assert.equal(filtered.nombre, 'Ana');
    });

    it('en extensión deja pasar el payload', () => {
        const filtered = filterExtendedForAction({ fecha_termino: '2026-12-01', eps: 'SURA' }, 'extend');
        assert.equal(filtered.fecha_termino, '2026-12-01');
    });
});

describe('isoDate AUT-313', () => {
    it('acepta ISO y descarta texto sucio de n8n', () => {
        assert.equal(isoDate('2026-11-15'), '2026-11-15');
        assert.equal(isoDate('28 de ener'), null);
        assert.equal(isoDate('31 de dici'), null);
    });
});

describe('filterContratosByClientes AUT-313', () => {
    it('un GP solo ve contratos de sus clientes', () => {
        const list = [
            { id: '1', cliente: 'EXPERIAN', vigente: true },
            { id: '2', cliente: 'DAVIVIENDA', vigente: true }
        ];
        const filtered = filterContratosByClientes(list, ['Experian']);
        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].cliente, 'EXPERIAN');
    });

    it('sin scope no recorta', () => {
        const list = [{ id: '1', cliente: 'EXPERIAN' }, { id: '2', cliente: 'DAVIVIENDA' }];
        assert.equal(filterContratosByClientes(list, null).length, 2);
    });
});

describe('sameCliente', () => {
    it('ignora mayúsculas y tildes', () => {
        assert.equal(sameCliente('Aval Valor Compartido', 'AVAL VALOR COMPARTIDO'), true);
        assert.equal(sameCliente('EXPERIAN', 'DAVIVIENDA'), false);
    });
});
