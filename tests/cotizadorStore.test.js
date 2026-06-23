const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createCotizadorStore } = require('../src/cotizador/cotizadorStore');

describe('cotizadorStore - Rediseño', () => {
    it('ensureSchema ejecuta las sentencias SQL de alteración para nuevas columnas', async () => {
        const queries = [];
        const mockPool = {
            query: async (sql) => {
                queries.push(sql);
                if (/SELECT COALESCE/i.test(sql)) {
                    return { rows: [{ m: 1 }] };
                }
                return { rows: [] };
            }
        };

        const store = createCotizadorStore({ pool: mockPool });
        await store.ensureReady();

        // Check if our new columns were added via ALTER TABLE
        const alterTitulo = queries.some(q => q.includes('ALTER TABLE cotizador_cotizaciones') && q.includes('titulo'));
        const alterEstado = queries.some(q => q.includes('ALTER TABLE cotizador_cotizaciones') && q.includes('estado'));
        const alterNotas = queries.some(q => q.includes('ALTER TABLE cotizador_cotizaciones') && q.includes('notas'));
        const alterTerminos = queries.some(q => q.includes('ALTER TABLE cotizador_cotizaciones') && q.includes('terminos'));

        assert.ok(alterTitulo, 'Debería agregar columna titulo');
        assert.ok(alterEstado, 'Debería agregar columna estado');
        assert.ok(alterNotas, 'Debería agregar columna notas');
        assert.ok(alterTerminos, 'Debería agregar columna terminos');
    });

    it('updateCotizacionEstado actualiza estado en cotizaciones y en resumen JSONB', async () => {
        const queries = [];
        const mockPool = {
            query: async (sql, params) => {
                queries.push({ sql, params });
                return { rowCount: 1, rows: [{ id: 123 }] };
            }
        };

        const store = createCotizadorStore({ pool: mockPool });
        const res = await store.updateCotizacionEstado(123, 'Aceptada');

        assert.equal(res.ok, true);
        const updateQuery = queries.find(q => q.sql.includes('UPDATE cotizador_cotizaciones') && q.sql.includes('estado = $1'));
        assert.ok(updateQuery, 'Debería realizar una consulta UPDATE con estado');
        assert.equal(updateQuery.params[0], 'Aceptada');
        assert.equal(updateQuery.params[1], 123);
    });
});
