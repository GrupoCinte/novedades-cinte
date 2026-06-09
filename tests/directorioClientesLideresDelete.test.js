const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerDirectorioRoutes } = require('../src/directorio/registerDirectorioRoutes');

const VALID_ID = '550e8400-e29b-41d4-a716-446655440001';

function authSuperAdmin(req, _res, next) {
    req.user = { role: 'super_admin', sub: '550e8400-e29b-41d4-a716-446655440000', email: 'admin@cinte.test' };
    next();
}

function limiter(_req, _res, next) {
    next();
}

function buildApp(deleteFn) {
    const app = express();
    app.use(express.json());
    registerDirectorioRoutes({
        app,
        pool: {
            query: async (sql) => {
                if (/INSERT INTO audit_log/i.test(sql)) return { rows: [] };
                return { rows: [] };
            }
        },
        verificarToken: authSuperAdmin,
        allowPanel: () => (_req, _res, next) => next(),
        adminActionLimiter: limiter,
        getLideresByCliente: async () => [],
        getAreaFromRole: () => 'Capital Humano',
        listClientesLideresPaged: async () => ({ rows: [], total: 0 }),
        listClientesLideresByClienteSummaryPaged: async () => ({ rows: [], total: 0 }),
        insertClienteLider: async () => ({}),
        updateClienteLiderById: async () => ({}),
        deleteClienteLiderById: deleteFn,
        listColaboradoresPaged: async () => ({ rows: [], total: 0 }),
        insertColaborador: async () => ({}),
        updateColaboradorByCedula: async () => ({}),
        deleteColaboradorByCedula: async () => null,
        listGpUsersForDirectorio: async () => [],
        insertGpUserPlaceholder: async () => ({}),
        updateGpUserById: async () => ({}),
        resolveOrCreateGpUserIdForColaboradorCedula: async () => ({}),
        clearGpUserReferences: async () => {},
        linkGpCognitoSubByEmail: async () => null,
        normalizeCedula: (v) => String(v || '').replace(/\D/g, ''),
        listMallaTurnosCeldasRange: async () => [],
        upsertMallaTurnosCeldas: async () => ({}),
        getMallaTurnoAprobacionStatus: async () => ({ aprobada: false }),
        getColaboradorByCedula: async () => null
    });
    return app;
}

test('DELETE /api/directorio/clientes-lideres/:id — 404 si no existe', async () => {
    const app = buildApp(async () => null);
    const res = await request(app).delete(`/api/directorio/clientes-lideres/${VALID_ID}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
});

test('DELETE /api/directorio/clientes-lideres/:id — 400 id inválido', async () => {
    const app = buildApp(async () => null);
    const res = await request(app).delete('/api/directorio/clientes-lideres/not-a-uuid');
    assert.equal(res.status, 400);
});

test('DELETE /api/directorio/clientes-lideres/:id — 200 y fila eliminada', async () => {
    let calledWith = null;
    const app = buildApp(async (id) => {
        calledWith = id;
        return { id, cliente: 'ACME', lider: 'Lider 1', nit: '900123456' };
    });
    const res = await request(app).delete(`/api/directorio/clientes-lideres/${VALID_ID}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(calledWith, VALID_ID);
    assert.equal(res.body.deleted.lider, 'Lider 1');
});
