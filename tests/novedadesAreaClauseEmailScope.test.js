'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    listNovedadesConsumidasEnBucketNov
} = require('../src/conciliaciones/conciliacionNovedadElegibilidad');

test('super_admin sin canViewAllAreas no anula novedades con AND FALSE', async () => {
    let sqlSeen = '';
    const pool = {
        query: async (sql) => {
            sqlSeen = String(sql);
            return {
                rows: [{ id: '1', cedula: '1', tipo_novedad: 'Vacaciones en tiempo' }]
            };
        }
    };
    const deps = {
        pool,
        normalizeCedula: (c) => String(c || '').replace(/\D/g, ''),
        canRoleViewType: () => true
    };
    const rows = await listNovedadesConsumidasEnBucketNov(
        deps,
        { role: 'super_admin' },
        {
            clienteCanon: 'CLARO BI/BA',
            factAnio: 2026,
            factMes: 7,
            billingType: 'EXPIRED_MONTH',
            novedadesYear: 2026,
            novedadesMonth: 6
        }
    );
    assert.equal(rows.length, 1);
    assert.equal(sqlSeen.includes('AND FALSE'), false);
});
