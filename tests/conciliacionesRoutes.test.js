const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerConciliacionesRoutes } = require('../src/conciliaciones/registerConciliacionesRoutes');

const stubAsync = async () => ({});

function buildApp(deps = {}) {
    const app = express();
    app.use(express.json());
    registerConciliacionesRoutes({
        app,
        verificarToken: deps.verificarToken,
        allowAnyPanel: deps.allowAnyPanel,
        applyScope: deps.applyScope,
        listConciliacionesClientesForScope: deps.listConciliacionesClientesForScope ?? (async () => []),
        getConciliacionResumenPorClienteMesForScope:
            deps.getConciliacionResumenPorClienteMesForScope ?? (async () => ({ ok: true, rows: [], totales: {} })),
        getConciliacionResumenTodosClientesMesForScope:
            deps.getConciliacionResumenTodosClientesMesForScope
            ?? (async () => ({ ok: true, allClients: true, rows: [], totales: {}, clientesCount: 0 })),
        listConciliacionNovedadesDetalleForScope:
            deps.listConciliacionNovedadesDetalleForScope ?? (async () => ({ ok: true, items: [] })),
        getConciliacionesDashboardResumenForScope:
            deps.getConciliacionesDashboardResumenForScope
            ?? (async () => ({ ok: true, clientesCount: 0, globalTotales: {}, rows: [] })),
        upsertConciliacionFacturacionForScope: deps.upsertConciliacionFacturacionForScope ?? stubAsync,
        upsertConciliacionFacturacionMasivaForScope: deps.upsertConciliacionFacturacionMasivaForScope ?? stubAsync,
        listConciliacionesFacturacionForScope: deps.listConciliacionesFacturacionForScope ?? (async () => [])
    });
    return app;
}

test('GET /api/conciliaciones/clientes devuelve lista', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: '550e8400-e29b-41d4-a716-446655440000', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => ['Cliente Uno', 'Cliente Dos'],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: true, rows: [], globalTotales: {}, clientesCount: 0 })
    });
    const res = await request(app).get('/api/conciliaciones/clientes');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.clientes, ['Cliente Uno', 'Cliente Dos']);
});

test('GET /api/conciliaciones/por-cliente sin cliente devuelve resumen multi-cliente', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => ['A', 'B'],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        getConciliacionResumenTodosClientesMesForScope: async () => ({
            ok: true,
            rows: [{ cedula: '1', nombre: 'Colab', cliente: 'A' }],
            totales: { tarifaSum: 1, deduccionSum: 0, facturaSum: 1, colaboradores: 1, conNovedad: 0 },
            clientesCount: 2
        }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: true, items: [] }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: true, rows: [], globalTotales: {}, clientesCount: 0 })
    });
    const res = await request(app).get('/api/conciliaciones/por-cliente').query({ year: 2026, month: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.allClients, true);
    assert.equal(res.body.rows.length, 1);
    assert.equal(res.body.clientesCount, 2);
});

test('GET /api/conciliaciones/por-cliente 400 sin year/month', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => [],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: true, rows: [], totales: {} }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: true, items: [] }),
        getConciliacionesDashboardResumenForScope: async () => ({
            ok: true,
            clientesCount: 1,
            globalTotales: { tarifaSum: 1, deduccionSum: 0, facturaSum: 1, colaboradores: 2, conNovedad: 0 },
            rows: [{ cliente: 'C', totales: { tarifaSum: 1, deduccionSum: 0, facturaSum: 1, colaboradores: 2, conNovedad: 0 } }]
        })
    });
    const res = await request(app).get('/api/conciliaciones/por-cliente').query({ cliente: 'X' });
    assert.equal(res.status, 400);
});

test('GET /api/conciliaciones/por-cliente propaga 403 del data layer', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'gp', sub: '550e8400-e29b-41d4-a716-446655440000', email: 'gp@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'gp', canViewAllAreas: false, areas: [], gpUserId: req.user.sub, gpEmail: 'gp@example.com' };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => ['Solo A'],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false, status: 403, error: 'Sin acceso a este cliente' }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: true, rows: [], globalTotales: {}, clientesCount: 0 })
    });
    const res = await request(app).get('/api/conciliaciones/por-cliente').query({ cliente: 'Otro', year: 2026, month: 5 });
    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
});

test('GET /api/conciliaciones/dashboard-resumen devuelve agregados', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => [],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: true, rows: [], totales: {} }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: true, items: [] }),
        getConciliacionesDashboardResumenForScope: async () => ({
            ok: true,
            clientesCount: 2,
            globalTotales: { tarifaSum: 100, deduccionSum: 10, facturaSum: 90, colaboradores: 5, conNovedad: 1 },
            rows: [{ cliente: 'A', totales: { tarifaSum: 100, deduccionSum: 10, facturaSum: 90, colaboradores: 5, conNovedad: 1 } }]
        })
    });
    const res = await request(app).get('/api/conciliaciones/dashboard-resumen').query({ year: 2026, month: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.clientesCount, 2);
    assert.equal(res.body.globalTotales.facturaSum, 90);
    assert.equal(res.body.rows.length, 1);
});

test('POST /api/conciliaciones/facturacion valida Zod y responde exitoso', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => [],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: false }),
        upsertConciliacionFacturacionForScope: async (scope, payload) => ({
            id: 'fact-id',
            cedula: payload.cedula,
            anio: payload.anio,
            mes: payload.mes,
            proyecto: payload.proyecto,
            observaciones: payload.observaciones,
            horas_facturadas: payload.horasFacturadas
        })
    });

    // Caso inválido (falta cédula/año/mes)
    const badRes = await request(app).post('/api/conciliaciones/facturacion').send({});
    assert.equal(badRes.status, 400);
    assert.equal(badRes.body.ok, false);

    // Caso feliz
    const goodRes = await request(app).post('/api/conciliaciones/facturacion').send({
        cedula: '12345678',
        anio: 2026,
        mes: 5,
        proyecto: 'Swat Project',
        observaciones: 'Todo correcto',
        horasFacturadas: 160
    });
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.body.ok, true);
    assert.equal(goodRes.body.data.id, 'fact-id');
    assert.equal(goodRes.body.data.proyecto, 'Swat Project');
});

test('POST /api/conciliaciones/facturacion/masiva valida Zod y responde exitoso', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => [],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: false }),
        upsertConciliacionFacturacionForScope: async () => ({}),
        upsertConciliacionFacturacionMasivaForScope: async (scope, payload) => ({
            updated: 5
        }),
        listConciliacionesFacturacionForScope: async () => []
    });

    // Caso inválido (falta cliente/año/mes)
    const badRes = await request(app).post('/api/conciliaciones/facturacion/masiva').send({});
    assert.equal(badRes.status, 400);
    assert.equal(badRes.body.ok, false);

    // Caso feliz
    const goodRes = await request(app).post('/api/conciliaciones/facturacion/masiva').send({
        cliente: 'Cliente X',
        anio: 2026,
        mes: 5,
        estado: 'RADICADA',
        facturaFv: 'FV-999',
        fechaRadicacion: '2026-05-21'
    });
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.body.ok, true);
    assert.equal(goodRes.body.data.updated, 5);
});

test('POST /api/conciliaciones/facturacion/masiva acepta cedulas opcionales', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    let received = null;
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => [],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: false }),
        upsertConciliacionFacturacionForScope: async () => ({}),
        upsertConciliacionFacturacionMasivaForScope: async (_scope, payload) => {
            received = payload;
            return { updated: payload.cedulas?.length || 0 };
        },
        listConciliacionesFacturacionForScope: async () => []
    });

    const res = await request(app).post('/api/conciliaciones/facturacion/masiva').send({
        cliente: 'Cliente X',
        anio: 2026,
        mes: 5,
        estado: 'CONCILIADA',
        cedulas: ['111', '222']
    });
    assert.equal(res.status, 200);
    assert.deepEqual(received.cedulas, ['111', '222']);
});

test('GET /api/conciliaciones/facturacion devuelve lista', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => [],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: false }),
        upsertConciliacionFacturacionForScope: async () => ({}),
        listConciliacionesFacturacionForScope: async (scope, year, month) => [
            { id: 'fact-id', cedula: '12345678', anio: year, mes: month, proyecto: 'X' }
        ]
    });

    const res = await request(app).get('/api/conciliaciones/facturacion').query({ year: 2026, month: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].proyecto, 'X');
});
