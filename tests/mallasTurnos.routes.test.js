const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerDirectorioRoutes } = require('../src/directorio/registerDirectorioRoutes');

function authWithRole(role) {
    return (req, _res, next) => {
        req.user = { role, sub: '550e8400-e29b-41d4-a716-446655440000', email: 'qa@cinte.test' };
        next();
    };
}

function limiter(_req, _res, next) {
    next();
}

function buildPoolAuditOnly() {
    return {
        query: async (sql) => {
            if (/INSERT INTO audit_log/i.test(sql)) {
                return { rows: [] };
            }
            return { rows: [] };
        }
    };
}

function buildApp(role, pool, mallaMocks = {}) {
    const listMallaTurnosCeldasRange =
        mallaMocks.listMallaTurnosCeldasRange ||
        (async (opts) => {
            assert.ok(opts.cliente);
            assert.ok(opts.desde);
            assert.ok(opts.hasta);
            return [
                {
                    fecha: '2026-05-10',
                    franja: '06_14',
                    cedula: '123',
                    nombre: 'Uno',
                    codigo: 'U1',
                    orden: 0
                }
            ];
        });
    const upsertMallaTurnosCeldas = mallaMocks.upsertMallaTurnosCeldas || (async () => {});

    const app = express();
    app.use(express.json());
    registerDirectorioRoutes({
        app,
        pool,
        verificarToken: authWithRole(role),
        allowPanel: () => (_req, _res, next) => next(),
        adminActionLimiter: limiter,
        getLideresByCliente: async () => [],
        getAreaFromRole: () => 'Capital Humano',
        listClientesLideresPaged: async () => ({ rows: [], total: 0 }),
        listClientesLideresByClienteSummaryPaged: async () => ({ rows: [], total: 0 }),
        insertClienteLider: async () => ({}),
        updateClienteLiderById: async () => ({}),
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
        listMallaTurnosCeldasRange,
        upsertMallaTurnosCeldas
    });
    return app;
}

const Q =
    'cliente=Cliente%20Demo&desde=2026-05-01&hasta=2026-05-31';

test('GET /api/directorio/mallas-turnos 403 para rol gp', async () => {
    const app = buildApp('gp', buildPoolAuditOnly());
    const res = await request(app).get(`/api/directorio/mallas-turnos?${Q}`);
    assert.equal(res.status, 403);
});

test('GET /api/directorio/mallas-turnos 400 sin cliente', async () => {
    const app = buildApp('super_admin', buildPoolAuditOnly());
    const res = await request(app).get('/api/directorio/mallas-turnos?desde=2026-05-01&hasta=2026-05-31');
    assert.equal(res.status, 400);
});

test('GET /api/directorio/mallas-turnos 400 sin hasta', async () => {
    const app = buildApp('super_admin', buildPoolAuditOnly());
    const res = await request(app).get('/api/directorio/mallas-turnos?cliente=X&desde=2026-05-01');
    assert.equal(res.status, 400);
});

test('GET /api/directorio/mallas-turnos 200 super_admin', async () => {
    const app = buildApp('super_admin', buildPoolAuditOnly());
    const res = await request(app).get(`/api/directorio/mallas-turnos?${Q}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].franja, '06_14');
});

test('PUT /api/directorio/mallas-turnos 403 para rol gp', async () => {
    const app = buildApp('gp', buildPoolAuditOnly());
    const res = await request(app)
        .put('/api/directorio/mallas-turnos')
        .send({
            cliente: 'Cliente Demo',
            patches: [{ fecha: '2026-05-10', franja: '06_14', cedulas: ['1234567890'] }]
        });
    assert.equal(res.status, 403);
});

test('PUT /api/directorio/mallas-turnos 400 franja inválida', async () => {
    const app = buildApp('cac', buildPoolAuditOnly());
    const res = await request(app)
        .put('/api/directorio/mallas-turnos')
        .send({
            cliente: 'Cliente Demo',
            patches: [{ fecha: '2026-05-10', franja: '99_99', cedulas: ['1234567890'] }]
        });
    assert.equal(res.status, 400);
});

test('PUT /api/directorio/mallas-turnos 200 cac y llama upsert', async () => {
    let payload;
    const app = buildApp('cac', buildPoolAuditOnly(), {
        upsertMallaTurnosCeldas: async (p) => {
            payload = p;
        }
    });
    const res = await request(app)
        .put('/api/directorio/mallas-turnos')
        .send({
            cliente: 'Cliente Demo',
            patches: [{ fecha: '2026-05-10', franja: '14_22', cedulas: ['1234567890'] }]
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(payload.cliente, 'Cliente Demo');
    assert.equal(payload.patches.length, 1);
    assert.equal(payload.patches[0].franja, '14_22');
    assert.deepEqual(payload.patches[0].cedulas, ['1234567890']);
});
