const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    decideContractAction,
    filterExtendedForAction,
    stripEconomiaFromPersonPatch,
    persistContratoEconomia,
    shouldWriteEconomiaToPerson,
    filterContratosByClientes,
    sameCliente,
    isoDate,
    resolveCloseTarget,
    closeContrato,
    reopenContrato
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

    it('guardar ficha en Bajas no se trata como reingreso', async () => {
        const { syncPersonContractsFromFicha } = require('../src/onboarding/colaboradorContratos');
        const r = await syncPersonContractsFromFicha(
            { query: async () => ({ rows: [], rowCount: 0 }) },
            {
                cedula: '1031647446',
                existed: { activo: false, cliente: 'SODIMAC' },
                cliente: 'SODIMAC',
                allowReingreso: false
            }
        );
        assert.equal(r.action, 'identity_only');
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

    it('otra pastilla no escribe plata en la cabecera (AUT-318)', () => {
        const filtered = stripEconomiaFromPersonPatch({
            eps: 'SURA',
            sueldo_nomina: 3_000_000,
            tarifa_cliente: 4_000_000,
            costo_empresa: 1,
            utilidad: 2,
            rt_aprox: 0.1,
            honorarios: '1000'
        });
        assert.equal(filtered.eps, 'SURA');
        assert.equal(filtered.sueldo_nomina, undefined);
        assert.equal(filtered.tarifa_cliente, undefined);
        assert.equal(filtered.costo_empresa, undefined);
        assert.equal(filtered.honorarios, undefined);
    });

    it('cliente nuevo no deja extras de OPS en la persona (AUT-318)', () => {
        const filtered = filterExtendedForAction(
            {
                eps: 'SURA',
                costo_licencias_teams_correo: 50_000,
                costo_equipo_computo: 80_000,
                auxilios_no_prestacionales: '20',
                otros_ingresos: '10'
            },
            'new_client'
        );
        assert.equal(filtered.eps, 'SURA');
        assert.equal(filtered.costo_licencias_teams_correo, undefined);
        assert.equal(filtered.costo_equipo_computo, undefined);
        assert.equal(filtered.auxilios_no_prestacionales, undefined);
        assert.equal(filtered.otros_ingresos, undefined);
    });
});

describe('economía de ficha AUT-318', () => {
    it('cliente nuevo o pastilla ajena no escriben plata en la persona', () => {
        assert.equal(shouldWriteEconomiaToPerson({ editingOther: true, contractAction: 'extend' }), false);
        assert.equal(shouldWriteEconomiaToPerson({ editingOther: false, contractAction: 'new_client' }), false);
        assert.equal(shouldWriteEconomiaToPerson({ editingOther: false, contractAction: 'extend' }), true);
    });

    it('contrato_id inválido no cae a la cabecera', async () => {
        const db = mockPool(async (sql) => {
            if (/SELECT \* FROM colaborador_contratos WHERE id/i.test(sql)) {
                return { rows: [] };
            }
            throw new Error(`query inesperada: ${sql}`);
        });
        await assert.rejects(
            () => persistContratoEconomia(db, {
                cedula: '79406590',
                contratoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                patch: { sueldo_nomina: 9_999_999, tarifa_cliente: 1 }
            }),
            (err) => err.status === 404 && /contrato/i.test(err.message)
        );
        assert.equal(db.calls.some((c) => /UPDATE colaborador_contratos/i.test(c.sql)), false);
        assert.equal(db.calls.some((c) => /es_cabecera IS TRUE/i.test(c.sql)), false);
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

describe('resolveCloseTarget AUT-313', () => {
    const vigentes = [
        { id: 'cab', cliente: 'SODIMAC', es_cabecera: true },
        { id: 'otro', cliente: 'Colsubsidio', es_cabecera: false }
    ];

    it('cierra por cliente y no toca el otro', () => {
        assert.equal(resolveCloseTarget(vigentes, { cliente: 'COLSUBSIDIO' }).id, 'otro');
    });

    it('varios vigentes sin cliente exige el cliente', () => {
        assert.throws(
            () => resolveCloseTarget(vigentes, {}),
            (err) => err.status === 400 && /cliente/i.test(err.message)
        );
    });

    it('un solo vigente se infiere', () => {
        assert.equal(resolveCloseTarget([vigentes[0]], {}).id, 'cab');
    });
});

function mockPool(handler) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql: String(sql), params });
            return handler(String(sql), params || []);
        }
    };
}

describe('closeContrato AUT-313', () => {
    it('cierra un cliente y deja a la persona activa si queda otro vigente', async () => {
        const sodimac = {
            id: '11111111-1111-4111-8111-111111111111',
            cedula: '1031647446',
            cliente: 'SODIMAC',
            tipo_contrato: 'OBRA',
            fecha_inicio: '2026-08-04',
            fecha_termino: '2026-10-30',
            vigente: true,
            es_cabecera: true
        };
        const colsub = {
            id: '22222222-2222-4222-8222-222222222222',
            cedula: '1031647446',
            cliente: 'Colsubsidio',
            tipo_contrato: 'OBRA',
            fecha_inicio: '2026-08-04',
            fecha_termino: '2026-09-04',
            vigente: true,
            es_cabecera: false
        };
        let closed = false;
        const db = mockPool((sql) => {
            if (sql.includes('FROM colaborador_contratos') && sql.includes('vigente IS TRUE')) {
                return { rows: closed ? [sodimac] : [sodimac, colsub], rowCount: closed ? 1 : 2 };
            }
            if (sql.includes('UPDATE colaborador_contratos') && sql.includes('vigente = FALSE')) {
                closed = true;
                return { rows: [], rowCount: 1 };
            }
            if (sql.includes('UPDATE colaborador_contratos') && sql.includes('es_cabecera')) {
                return { rows: [], rowCount: 1 };
            }
            if (sql.includes('UPDATE colaboradores')) {
                return { rows: [{ cedula: '1031647446', activo: true }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        });

        const r = await closeContrato(db, {
            cedula: '1031647446',
            cliente: 'Colsubsidio',
            fechaTermino: '2026-09-04',
            motivo: 'Termino de Servicio'
        });
        assert.equal(r.action, 'close_contrato');
        assert.equal(r.personActivo, true);
        assert.equal(r.vigentesRestantes, 1);
        assert.equal(r.contrato.cliente, 'Colsubsidio');
        const closeSql = db.calls.find((c) => c.sql.includes('vigente = FALSE'));
        assert.equal(closeSql.params[0], colsub.id);
    });
});

describe('reopenContrato AUT-313', () => {
    it('si ya hay vigente de ese cliente no abre otro', async () => {
        const vigente = {
            id: '33333333-3333-4333-8333-333333333333',
            cedula: '1',
            cliente: 'Colsubsidio',
            vigente: true,
            es_cabecera: true
        };
        const db = mockPool((sql) => {
            if (sql.includes('vigente IS TRUE') && sql.includes('lower(btrim(cliente))')) {
                return { rows: [vigente], rowCount: 1 };
            }
            if (sql.includes('FROM colaborador_contratos') && sql.includes('vigente IS TRUE')) {
                return { rows: [vigente], rowCount: 1 };
            }
            if (sql.includes('UPDATE colaboradores') || sql.includes('UPDATE colaborador_contratos')) {
                return { rows: [{ cedula: '1', activo: true }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        });
        const r = await reopenContrato(db, { cedula: '1', cliente: 'Colsubsidio' });
        assert.equal(r.action, 'noop_already_vigente');
        assert.equal(r.personActivo, true);
    });
});
