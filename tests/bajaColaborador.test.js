'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyRegistroBajaColaborador, DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO } = require('../src/onboarding/bajaColaborador');

test('applyRegistroBajaColaborador setea motivo_baja y fecha_baja_efectiva', async () => {
    const updates = [];
    const pool = {
        query: async (sql, params) => {
            updates.push({ sql: String(sql), params });
            if (String(sql).includes('FROM cat_motivo_baja')) {
                return { rows: [{ motivo: DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO }] };
            }
            if (String(sql).startsWith('UPDATE colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: params[3],
                            activo: false,
                            motivo_baja: params[0],
                            fecha_termino: params[2],
                            fecha_baja_efectiva: params[2]
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const r = await applyRegistroBajaColaborador(pool, '12345678', {
        fecha_termino: '2026-06-30'
    });
    assert.equal(r.activo, false);
    assert.equal(r.motivo_baja, DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO);
    assert.equal(r.fecha_baja_efectiva, '2026-06-30');
});
