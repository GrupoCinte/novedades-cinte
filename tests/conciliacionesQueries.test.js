const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCedula } = require('../src/utils');
const { canRoleViewType } = require('../src/rbac');
const { getConciliacionResumenPorClienteMes } = require('../src/conciliaciones/conciliacionesQueries');

test('getConciliacionResumenPorClienteMes agrega solo novedades visibles y calcula factura', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        { cedula: '12.345.678', tipo_novedad: 'Incapacidad', monto_cop: '100' },
                        { cedula: '12.345.678', tipo_novedad: 'Incapacidad', monto_cop: '50.25' }
                    ]
                };
            }
            if (String(sql).includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '5000',
                            moneda: 'COP',
                            profesion: 'Dev'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows, totales } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].novedadesCount, 2);
    assert.equal(rows[0].novedadesSumCop, 150.25);
    assert.equal(rows[0].facturaCop, 5000 - 150.25);
    assert.equal(totales.tarifaSum, 5000);
    assert.equal(totales.deduccionSum, 150.25);
    assert.equal(totales.colaboradores, 1);
    assert.equal(totales.conNovedad, 1);
});
