const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerConciliacionesRoutes } = require('../src/conciliaciones/registerConciliacionesRoutes');

function buildApp(deps) {
    const app = express();
    app.use(express.json());
    registerConciliacionesRoutes({
        app,
        verificarToken: deps.verificarToken,
        allowAnyPanel: deps.allowAnyPanel,
        applyScope: deps.applyScope,
        listConciliacionesClientesForScope: deps.listConciliacionesClientesForScope,
        getConciliacionResumenPorClienteMesForScope: deps.getConciliacionResumenPorClienteMesForScope,
        listConciliacionNovedadesDetalleForScope: deps.listConciliacionNovedadesDetalleForScope,
        getConciliacionesDashboardResumenForScope: deps.getConciliacionesDashboardResumenForScope
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
