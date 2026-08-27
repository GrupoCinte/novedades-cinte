const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    actorFromUser,
    diffContractSnapshots,
    diffFichaSnapshots,
    normalizeHistorialValue,
    toApiHistorial
} = require('../src/onboarding/contratoHistorial');

describe('diffContractSnapshots AUT-317', () => {
    it('registra fecha, cliente y estado cuando cambian', () => {
        const rows = diffContractSnapshots(
            {
                cliente: 'EXPERIAN',
                tipo_contrato: 'Fijo',
                fecha_termino: '2026-10-01',
                vigente: true
            },
            {
                cliente: 'DAVIVIENDA',
                tipo_contrato: 'Fijo',
                fecha_termino: '2026-12-01',
                vigente: false
            }
        );
        const campos = rows.map((r) => r.campo);
        assert.deepEqual(campos, ['cliente', 'fecha_termino', 'vigente']);
        assert.equal(rows.find((r) => r.campo === 'vigente').valorDespues, 'Cerrado');
        assert.equal(rows.find((r) => r.campo === 'fecha_termino').valorAntes, '2026-10-01');
    });

    it('no genera fila si tarifa es 1000 y 1000.00', () => {
        const rows = diffContractSnapshots(
            { tarifa_cliente: '1000.00', costo_empresa: 2500 },
            { tarifa_cliente: 1000, costo_empresa: '2500.0' }
        );
        assert.equal(rows.length, 0);
    });

    it('ignora campos de persona que no son del contrato', () => {
        const rows = diffContractSnapshots(
            { nombre: 'Ana', eps: 'SURA', cliente: 'EXPERIAN' },
            { nombre: 'Ana María', eps: 'NUEVA', cliente: 'EXPERIAN' }
        );
        assert.equal(rows.length, 0);
    });

    it('alta: vacío → valores iniciales', () => {
        const rows = diffContractSnapshots(
            {},
            { cliente: 'EXPERIAN', vigente: true, tipo_contrato: 'Obra' }
        );
        assert.equal(rows.find((r) => r.campo === 'cliente').valorDespues, 'EXPERIAN');
        assert.equal(rows.find((r) => r.campo === 'vigente').valorDespues, 'Vigente');
        assert.equal(rows.find((r) => r.campo === 'tipo_contrato').campoLabel, 'Tipo de contrato');
    });
});

describe('diffFichaSnapshots AUT-317', () => {
    it('registra cualquier campo que el analista cambie, agregue o quite', () => {
        const rows = diffFichaSnapshots(
            { nombre: 'Ana', eps: 'SURA', celular_personal: '300111' },
            { nombre: 'Ana María', eps: 'SURA', celular_personal: '' }
        );
        const by = Object.fromEntries(rows.map((r) => [r.campo, r]));
        assert.equal(by.nombre.valorDespues, 'Ana María');
        assert.equal(by.celular_personal.valorAntes, '300111');
        assert.equal(by.celular_personal.valorDespues, '');
        assert.equal(by.eps, undefined);
    });

    it('no inventa Quitó Tipo de personal si el SELECT de después no trae esa columna', () => {
        const rows = diffFichaSnapshots(
            { nombre: 'Ana', tipo_personal: 'consultor', eps: 'SURA' },
            { nombre: 'Ana', eps: 'SURA' }
        );
        assert.equal(rows.length, 0);
    });

    it('solo compara las claves que el analista mandó a guardar', () => {
        const rows = diffFichaSnapshots(
            { nombre: 'Ana', eps: 'SURA', celular_personal: '300' },
            { nombre: 'Ana', eps: 'NUEVA', celular_personal: '' },
            { onlyKeys: ['eps'] }
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].campo, 'eps');
    });

    it('no registra edad automática ni timestamps', () => {
        const rows = diffFichaSnapshots(
            { edad: 30, updated_at: 'a', eps: 'SURA' },
            { edad: 31, updated_at: 'b', eps: 'SURA' }
        );
        assert.equal(rows.length, 0);
    });
});

describe('normalizeHistorialValue AUT-317', () => {
    it('normaliza fechas sucias a ISO', () => {
        assert.equal(normalizeHistorialValue('fecha_inicio', '2026-08-04T05:00:00.000Z'), '2026-08-04');
    });
});

describe('actorFromUser AUT-317', () => {
    it('usa nombre y correo del usuario', () => {
        const actor = actorFromUser({ name: 'Luis Correa', email: 'luis@grupocinte.com', sub: 'not-a-uuid' });
        assert.equal(actor.nombre, 'Luis Correa');
        assert.equal(actor.email, 'luis@grupocinte.com');
        assert.equal(actor.userId, null);
    });

    it('sin usuario queda Sistema', () => {
        assert.equal(actorFromUser(null).nombre, 'Sistema');
    });
});

describe('toApiHistorial AUT-317', () => {
    it('expone campo, antes, después y actor', () => {
        const api = toApiHistorial({
            id: 'a',
            contrato_id: 'b',
            campo: 'fecha_termino',
            valor_antes: '2026-10-01',
            valor_despues: '2026-12-01',
            actor_nombre: 'Luis',
            actor_email: 'luis@grupocinte.com',
            created_at: '2026-08-26T12:00:00.000Z'
        });
        assert.equal(api.campoLabel, 'Fecha de término');
        assert.equal(api.valorAntes, '2026-10-01');
        assert.equal(api.actorNombre, 'Luis');
    });
});
