'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCancelarColaborador } = require('../src/onboarding/cancelarColaborador');

function poolFromRows(handlers) {
    return {
        query: async (sql, params) => {
            const s = String(sql);
            for (const h of handlers) {
                if (h.match(s)) return h.run(params, s);
            }
            return { rows: [], rowCount: 0 };
        }
    };
}

test('applyCancelarColaborador saca de activos sin motivo_baja', async () => {
    const pool = poolFromRows([
        {
            match: (s) => s.includes('FROM colaboradores WHERE cedula') && s.includes('cancelado'),
            run: () => ({ rows: [{ cedula: '123', activo: true, motivo_baja: null, cancelado: false }] })
        },
        {
            match: (s) => s.includes('UPDATE colaborador_contratos'),
            run: () => ({ rows: [], rowCount: 1 })
        },
        {
            match: (s) => s.includes('UPDATE colaboradores'),
            run: () => ({
                rows: [
                    {
                        cedula: '123',
                        nombre: 'Ana',
                        cliente: 'CINTE',
                        tipo_personal: 'staff',
                        activo: false,
                        cancelado: true,
                        fecha_cancelacion: '2026-08-27T14:00:00.000Z',
                        obs_cancelacion: 'no corrió',
                        motivo_baja: null,
                        fecha_ingreso: '2026-08-01',
                        puesto: 'Analista'
                    }
                ]
            })
        }
    ]);

    const r = await applyCancelarColaborador(pool, '123', { observaciones: 'no corrió' });
    assert.equal(r.activo, false);
    assert.equal(r.cancelado, true);
    assert.equal(r.motivo_baja, null);
    assert.equal(r.item.tipo_personal, 'staff');
});

test('applyCancelarColaborador no toca a quien ya está en Bajas', async () => {
    const pool = poolFromRows([
        {
            match: (s) => s.includes('FROM colaboradores WHERE cedula'),
            run: () => ({
                rows: [{ cedula: '123', activo: false, motivo_baja: 'Renuncia Voluntaria', cancelado: false }]
            })
        }
    ]);
    await assert.rejects(
        () => applyCancelarColaborador(pool, '123'),
        (err) => err.status === 400 && /Bajas/i.test(err.message)
    );
});

test('applyCancelarColaborador no vuelve a cancelar', async () => {
    const pool = poolFromRows([
        {
            match: (s) => s.includes('FROM colaboradores WHERE cedula'),
            run: () => ({ rows: [{ cedula: '123', activo: false, motivo_baja: null, cancelado: true }] })
        }
    ]);
    await assert.rejects(
        () => applyCancelarColaborador(pool, '123'),
        (err) => err.status === 409
    );
});
