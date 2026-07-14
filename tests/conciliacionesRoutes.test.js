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
        applyConciliacionFacturacionRevisionForScope: deps.applyConciliacionFacturacionRevisionForScope ?? stubAsync,
        applyConciliacionFacturacionRevisionMasivaForScope: deps.applyConciliacionFacturacionRevisionMasivaForScope ?? stubAsync,
        applyConciliacionFacturacionAjustesForScope: deps.applyConciliacionFacturacionAjustesForScope ?? stubAsync,
        createConciliacionNovedadManualForScope: deps.createConciliacionNovedadManualForScope ?? stubAsync,
        listConciliacionFacturacionHistorialForScope: deps.listConciliacionFacturacionHistorialForScope ?? (async () => []),
        upsertConciliacionFacturacionMasivaForScope: deps.upsertConciliacionFacturacionMasivaForScope ?? stubAsync,
        deleteConciliacionFacturacionForScope: deps.deleteConciliacionFacturacionForScope ?? (async () => ({ reverted: 0 })),
        listConciliacionesFacturacionForScope: deps.listConciliacionesFacturacionForScope ?? (async () => []),
        getColaCierresPorMesForScope:
            deps.getColaCierresPorMesForScope
            ?? (async () => ({ ok: true, items: [], count: 0 })),
        listServiciosForScope: deps.listServiciosForScope ?? (async () => []),
        createServicioForScope: deps.createServicioForScope ?? stubAsync,
        updateServicioForScope: deps.updateServicioForScope ?? stubAsync,
        deleteServicioForScope: deps.deleteServicioForScope ?? stubAsync,
        listServicioConsultoresForScope: deps.listServicioConsultoresForScope ?? (async () => []),
        listConsultoresDisponiblesClienteForScope: deps.listConsultoresDisponiblesClienteForScope ?? (async () => []),
        upsertServicioConsultoresForScope: deps.upsertServicioConsultoresForScope ?? stubAsync,
        listDashboardLiderClienteRowsForScope: deps.listDashboardLiderClienteRowsForScope ?? (async () => []),
        exportConciliacionServicioExcelForScope: deps.exportConciliacionServicioExcelForScope ?? stubAsync,
        markConciliacionServicioEnviadaForScope: deps.markConciliacionServicioEnviadaForScope ?? stubAsync,
        markConciliacionServicioConciliadaForScope: deps.markConciliacionServicioConciliadaForScope ?? stubAsync,
        enviarConciliacionServicioCorreoForScope: deps.enviarConciliacionServicioCorreoForScope ?? stubAsync,
        getConciliacionEmailPlantillaCorreoLiderForScope:
            deps.getConciliacionEmailPlantillaCorreoLiderForScope ?? stubAsync,
        upsertConciliacionEmailPlantillaCorreoLiderForScope:
            deps.upsertConciliacionEmailPlantillaCorreoLiderForScope ?? stubAsync
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

test('GET /api/conciliaciones/clientes merge clientes Dynamo para nomina', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'nomina', sub: 'x', email: 'nomina@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'nomina', canViewAllAreas: false, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => ['Cliente PG'],
        listServiciosForScope: async () => [{ id: 's1', client: 'Solo Dynamo', serviceName: 'SVC' }],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: true, rows: [], globalTotales: {}, clientesCount: 0 })
    });
    const res = await request(app).get('/api/conciliaciones/clientes');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.clientes, ['Cliente PG', 'Solo Dynamo']);
});

test('GET /api/conciliaciones/clientes no merge Dynamo para gp', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'gp', sub: 'x', email: 'gp@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'gp', canViewAllAreas: false, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        listConciliacionesClientesForScope: async () => ['Cliente PG'],
        listServiciosForScope: async () => [{ id: 's1', client: 'Solo Dynamo', serviceName: 'SVC' }],
        getConciliacionResumenPorClienteMesForScope: async () => ({ ok: false }),
        listConciliacionNovedadesDetalleForScope: async () => ({ ok: false }),
        getConciliacionesDashboardResumenForScope: async () => ({ ok: true, rows: [], globalTotales: {}, clientesCount: 0 })
    });
    const res = await request(app).get('/api/conciliaciones/clientes');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.clientes, ['Cliente PG']);
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
        estado: 'APROBADO_FINANZAS',
        facturaFv: 'FV-999',
        fechaRadicacion: '2026-05-21'
    });
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.body.ok, true);
    assert.equal(goodRes.body.data.updated, 5);
});

test('DELETE /api/conciliaciones/facturacion valida Zod y revierte cierre', async () => {
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
        deleteConciliacionFacturacionForScope: async (_scope, payload) => {
            received = payload;
            return { reverted: 1 };
        }
    });

    // Caso inválido (falta cédula/año/mes/observación)
    const badRes = await request(app).delete('/api/conciliaciones/facturacion').send({});
    assert.equal(badRes.status, 400);
    assert.equal(badRes.body.ok, false);

    // Caso feliz
    const goodRes = await request(app).delete('/api/conciliaciones/facturacion').send({
        cedula: '12345678',
        anio: 2026,
        mes: 5,
        observacion: 'Revertir por error de datos'
    });
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.body.ok, true);
    assert.equal(goodRes.body.data.reverted, 1);
    assert.equal(received.cedula, '12345678');
    assert.equal(received.observacion, 'Revertir por error de datos');
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

test('GET /api/conciliaciones/facturacion/cola-cierres devuelve items agregados', async () => {
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
        getColaCierresPorMesForScope: async (_scope, year, month, cliente) => ({
            ok: true,
            count: 1,
            items: [
                {
                    servicioId: 'srv-1',
                    client: cliente || 'Cliente X',
                    serviceName: 'ORBIT',
                    closingDay: 25,
                    consultoresTotal: 3,
                    consultoresCerrados: 1,
                    estadoCola: 'PENDIENTE',
                    totales: { tarifaSum: 1000, deduccionSum: 100, facturaSum: 900 }
                }
            ]
        })
    });

    const res = await request(app)
        .get('/api/conciliaciones/facturacion/cola-cierres')
        .query({ year: 2026, month: 5, cliente: 'Cliente X' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.items[0].serviceName, 'ORBIT');
    assert.equal(res.body.items[0].estadoCola, 'PENDIENTE');
});

test('GET /api/conciliaciones/facturacion/cola-cierres 400 sin year/month', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    const app = buildApp({ verificarToken: noAuth, allowAnyPanel: () => (_r, _res, next) => next(), applyScope });
    const res = await request(app).get('/api/conciliaciones/facturacion/cola-cierres');
    assert.equal(res.status, 400);
});

test('GET /api/conciliaciones/servicios devuelve lista', async () => {
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
        listServiciosForScope: async () => [{ id: 'srv-1', nombreServicio: 'Soporte' }]
    });

    const res = await request(app).get('/api/conciliaciones/servicios');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].nombreServicio, 'Soporte');
});

test('POST /api/conciliaciones/servicios crea servicio', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    let receivedPayload = null;
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        createServicioForScope: async (scope, payload) => {
            receivedPayload = payload;
            return { id: 'new-srv', ...payload };
        }
    });

    const res = await request(app).post('/api/conciliaciones/servicios').send({
        client: 'Cliente DEMO',
        serviceName: 'Soporte',
        initDate: '2026-06-08',
        closingDay: 31,
        billingMode: 'HOURS',
        billingType: 'EXPIRED_MONTH',
        baseHours: 160
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.id, 'new-srv');
    assert.equal(receivedPayload.serviceName, 'Soporte');
});

test('PUT /api/conciliaciones/servicios/:idServicio actualiza servicio', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    let receivedPayload = null;
    let receivedId = null;
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        updateServicioForScope: async (scope, id, payload) => {
            receivedId = id;
            receivedPayload = payload;
            return { id, ...payload };
        }
    });

    const res = await request(app).put('/api/conciliaciones/servicios/srv-123').send({
        client: 'Cliente DEMO',
        serviceName: 'Soporte Modificado',
        initDate: '2026-06-08',
        closingDay: 15,
        billingMode: 'HOURS',
        billingType: 'EXPIRED_MONTH',
        baseHours: 160
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.id, 'srv-123');
    assert.equal(receivedId, 'srv-123');
    assert.equal(receivedPayload.serviceName, 'Soporte Modificado');
});

test('DELETE /api/conciliaciones/servicios/:idServicio elimina servicio', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'qa@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        next();
    };
    let receivedId = null;
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        deleteServicioForScope: async (scope, id) => {
            receivedId = id;
            return { success: true };
        }
    });

    const res = await request(app).delete('/api/conciliaciones/servicios/srv-123');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(receivedId, 'srv-123');
});

test('POST /api/conciliaciones/facturacion/ajustes guarda con payload válido', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'analista_conciliaciones', sub: 'x', email: 'a@example.com', full_name: 'Ana' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'analista_conciliaciones', canViewAllAreas: false, areas: [] };
        next();
    };
    let received = null;
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        applyConciliacionFacturacionAjustesForScope: async (_scope, payload, actor) => {
            received = { payload, actor };
            return { id: 'f1', estado: 'PENDIENTE' };
        }
    });

    const res = await request(app)
        .post('/api/conciliaciones/facturacion/ajustes')
        .send({
            cedula: '1234567890',
            anio: 2026,
            mes: 5,
            observacion: 'Ajuste comercial acordado',
            tarifaOverride: 3200000
        });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(received.payload.tarifaOverride, 3200000);
    assert.equal(received.actor.email, 'a@example.com');
});

test('POST /api/conciliaciones/facturacion/ajustes rechaza sin observación', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'analista_conciliaciones', sub: 'x', email: 'a@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'analista_conciliaciones', canViewAllAreas: false, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope
    });

    const res = await request(app)
        .post('/api/conciliaciones/facturacion/ajustes')
        .send({
            cedula: '1234567890',
            anio: 2026,
            mes: 5,
            tarifaOverride: 3200000
        });

    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
});

test('POST /api/conciliaciones/facturacion/ajustes propaga error 403 del backend', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'nomina', sub: 'x', email: 'n@example.com' };
        next();
    };
    const applyScope = (req, _res, next) => {
        req.scope = { role: 'nomina', canViewAllAreas: false, areas: [] };
        next();
    };
    const app = buildApp({
        verificarToken: noAuth,
        allowAnyPanel: () => (_r, _res, next) => next(),
        applyScope,
        applyConciliacionFacturacionAjustesForScope: async () => {
            const err = new Error('No autorizado para ajustar montos en el estado actual');
            err.status = 403;
            throw err;
        }
    });

    const res = await request(app)
        .post('/api/conciliaciones/facturacion/ajustes')
        .send({
            cedula: '1234567890',
            anio: 2026,
            mes: 5,
            observacion: 'Intento no permitido',
            tarifaOverride: 3200000
        });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /No autorizado/);
});

test('GET /novedades-detalle devuelve tarifaValorHora con billingMode HOURS', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'a@example.com', full_name: 'Admin' };
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
        listConciliacionNovedadesDetalleForScope: async (_scope, _cliente, _cedula, _year, _month, impactOpts) => ({
            ok: true,
            clienteCanon: 'Cliente',
            items: [],
            billingMode: 'HOURS',
            baseHours: 160,
            horasBaseMes: 160,
            tarifaValorHora: 22_000,
            tarifaCliente: 3_520_000,
            tarifaMaestro: 3_520_000,
            tarifaAjustada: false,
            facturaCop: 3_520_000,
            _impactOpts: impactOpts
        })
    });

    const res = await request(app)
        .get('/api/conciliaciones/novedades-detalle')
        .query({
            cliente: 'Cliente',
            cedula: '1010195848',
            year: 2026,
            month: 6,
            billingMode: 'HOURS',
            baseHours: 160
        });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.billingMode, 'HOURS');
    assert.equal(res.body.baseHours, 160);
    assert.equal(res.body.horasBaseMes, 160);
    assert.equal(res.body.tarifaValorHora, 22_000);
});

test('POST /facturacion/ajustes reenvía billingType al handler', async () => {
    const noAuth = (req, _res, next) => {
        req.user = { role: 'super_admin', sub: 'x', email: 'a@example.com', full_name: 'Admin' };
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
        applyConciliacionFacturacionAjustesForScope: async (_scope, payload) => {
            received = payload;
            return { id: 'f1' };
        }
    });

    const res = await request(app)
        .post('/api/conciliaciones/facturacion/ajustes')
        .send({
            cedula: '1010195848',
            anio: 2026,
            mes: 6,
            observacion: 'Ajuste con mes vencido',
            billingType: 'EXPIRED_MONTH',
            tarifaOverride: 3200000
        });

    assert.equal(res.status, 200);
    assert.equal(received.billingType, 'EXPIRED_MONTH');
});
