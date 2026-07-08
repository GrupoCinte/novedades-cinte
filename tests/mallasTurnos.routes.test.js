const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerDirectorioRoutes } = require('../src/directorio/registerDirectorioRoutes');
const { buildConfigPayload } = require('../src/directorio/mallaNocturnoConfig');
const {
    colaboradorDemo,
    buildPoolReaprobacionRouteMock
} = require('./helpers/mallaTurnoAprobacionMocks');

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
    const getMallaNocturnoConfig =
        mallaMocks.getMallaNocturnoConfig ||
        (async () => ({
            horaInicio: '22:00',
            horaFin: '06:00',
            cantidadHoras: 8,
            label: '22:00–06:00 (8 h)'
        }));
    const upsertMallaNocturnoConfig =
        mallaMocks.upsertMallaNocturnoConfig ||
        (async ({ horaInicio, horaFin }) => buildConfigPayload(horaInicio, horaFin));

    const app = express();
    app.use(express.json());
    registerDirectorioRoutes({
        app,
        pool,
        verificarToken: authWithRole(role),
        allowPanel: () => (_req, _res, next) => next(),
        adminActionLimiter: limiter,
        getLideresByCliente: mallaMocks.getLideresByCliente || (async () => []),
        getAreaFromRole: () => 'Capital Humano',
        listClientesLideresPaged: async () => ({ rows: [], total: 0 }),
        listClientesLideresByClienteSummaryPaged: async () => ({ rows: [], total: 0 }),
        insertClienteLider: async () => ({}),
        updateClienteLiderById: async () => ({}),
        deleteClienteLiderById: async () => null,
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
        upsertMallaTurnosCeldas,
        getMallaTurnoAprobacionStatus:
            mallaMocks.getMallaTurnoAprobacionStatus ||
            (async () => ({
                aprobada: false,
                aprobadoEn: null,
                novedadesGeneradas: 0,
                aprobadoPorEmail: null
            })),
        getMallaNocturnoConfig,
        upsertMallaNocturnoConfig,
        getColaboradorByCedula: mallaMocks.getColaboradorByCedula || (async () => null)
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
    assert.match(res.body.error || '', /franja/i);
});

test('PUT /api/directorio/mallas-turnos 400 cédula inválida con mensaje descriptivo', async () => {
    const app = buildApp('cac', buildPoolAuditOnly());
    const res = await request(app)
        .put('/api/directorio/mallas-turnos')
        .send({
            cliente: 'Cliente Demo',
            patches: [{ fecha: '2026-05-10', franja: '14_22', cedulas: ['12'] }]
        });
    assert.equal(res.status, 400);
    assert.notEqual(res.body.error, 'Datos inválidos');
    assert.match(res.body.error || '', /[Cc]édula/);
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

test('PUT /api/directorio/mallas-turnos 200 acepta mode merge', async () => {
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
            patches: [
                {
                    fecha: '2026-05-10',
                    franja: '22_06',
                    cedulas: ['1234567890'],
                    horaInicio: '22:00',
                    horaFin: '06:00',
                    mode: 'merge'
                }
            ]
        });
    assert.equal(res.status, 200);
    assert.equal(payload.patches[0].mode, 'merge');
    assert.equal(payload.patches[0].horaInicio, '22:00');
});

test('PUT /api/directorio/mallas-turnos 400 mode inválido', async () => {
    const app = buildApp('cac', buildPoolAuditOnly());
    const res = await request(app)
        .put('/api/directorio/mallas-turnos')
        .send({
            cliente: 'Cliente Demo',
            patches: [
                {
                    fecha: '2026-05-10',
                    franja: '14_22',
                    cedulas: ['1234567890'],
                    mode: 'append'
                }
            ]
        });
    assert.equal(res.status, 400);
});

test('GET /api/directorio/mallas-turnos/aprobacion 403 para rol gp', async () => {
    const app = buildApp('gp', buildPoolAuditOnly());
    const res = await request(app).get(
        '/api/directorio/mallas-turnos/aprobacion?cliente=Cliente%20Demo&anio=2026&mes=6&variant=mallas'
    );
    assert.equal(res.status, 403);
});

test('GET /api/directorio/mallas-turnos/aprobacion 200 super_admin', async () => {
    const app = buildApp('super_admin', buildPoolAuditOnly(), {
        getMallaTurnoAprobacionStatus: async () => ({
            aprobada: true,
            aprobadoEn: '2026-06-01T12:00:00.000Z',
            novedadesGeneradas: 5,
            aprobadoPorEmail: 'cac@cinte.test'
        })
    });
    const res = await request(app).get(
        '/api/directorio/mallas-turnos/aprobacion?cliente=Cliente%20Demo&anio=2026&mes=6&variant=mallas'
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.aprobada, true);
    assert.equal(res.body.novedadesGeneradas, 5);
});

test('POST /api/directorio/mallas-turnos/aprobar 403 para rol gp', async () => {
    const app = buildApp('gp', buildPoolAuditOnly());
    const res = await request(app)
        .post('/api/directorio/mallas-turnos/aprobar')
        .send({ cliente: 'Cliente Demo', anio: 2026, mes: 6, variant: 'mallas' });
    assert.equal(res.status, 403);
});

test('POST /api/directorio/mallas-turnos/aprobar 400 sin asignaciones', async () => {
    const { aprobarMallaTurnosMes } = require('../src/mallaTurnoHeExport');
    const orig = aprobarMallaTurnosMes;
    const app = buildApp('cac', buildPoolAuditOnly(), {
        listMallaTurnosCeldasRange: async () => []
    });
    const res = await request(app)
        .post('/api/directorio/mallas-turnos/aprobar')
        .send({ cliente: 'Cliente Demo', anio: 2026, mes: 6, variant: 'mallas' });
    assert.equal(res.status, 400);
    assert.match(res.body.error || '', /asignaciones/i);
    void orig;
});

test('POST /api/directorio/mallas-turnos/aprobar 200 re-aprobación super_admin', async () => {
    const { pool, captured } = buildPoolReaprobacionRouteMock();
    const app = buildApp('super_admin', pool, {
        getColaboradorByCedula: async () => colaboradorDemo,
        getLideresByCliente: async () => ['Lider Demo'],
        listMallaTurnosCeldasRange: async () => [
            { fecha: '2026-06-10', franja: '14_22', cedula: '1234567890', nombre: 'Colaborador Uno' }
        ]
    });
    const res = await request(app)
        .post('/api/directorio/mallas-turnos/aprobar')
        .send({ cliente: 'Cliente Demo', anio: 2026, mes: 6, variant: 'mallas' });
    assert.equal(res.status, 200, res.body?.error || '');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.reaprobacion, true);
    assert.equal(res.body.novedadesGeneradas, 1);
    assert.match(captured.observaciones[0] || '', /Modificación a la aprobación original/i);
});

test('POST /api/directorio/mallas-turnos/aprobar 409 no aplica a super_admin en mes ya aprobado', async () => {
    const { pool } = buildPoolReaprobacionRouteMock();
    const app = buildApp('cac', pool, {
        getColaboradorByCedula: async () => colaboradorDemo,
        getLideresByCliente: async () => ['Lider Demo'],
        listMallaTurnosCeldasRange: async () => [
            { fecha: '2026-06-10', franja: '06_14', cedula: '1234567890', nombre: 'Colaborador Uno' }
        ]
    });
    const res = await request(app)
        .post('/api/directorio/mallas-turnos/aprobar')
        .send({ cliente: 'Cliente Demo', anio: 2026, mes: 6, variant: 'mallas' });
    assert.notEqual(res.status, 409, res.body?.error || 'no debe bloquear re-aprobación CAC');
    assert.equal(res.status, 200);
});

test('GET /api/directorio/mallas-turnos/nocturno-config 403 para rol gp', async () => {
    const app = buildApp('gp', buildPoolAuditOnly());
    const res = await request(app).get('/api/directorio/mallas-turnos/nocturno-config');
    assert.equal(res.status, 403);
});

test('GET /api/directorio/mallas-turnos/nocturno-config 200 default', async () => {
    const app = buildApp('super_admin', buildPoolAuditOnly());
    const res = await request(app).get('/api/directorio/mallas-turnos/nocturno-config');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.horaInicio, '22:00');
    assert.equal(res.body.horaFin, '06:00');
    assert.equal(res.body.cantidadHoras, 8);
});

test('PUT /api/directorio/mallas-turnos/nocturno-config 400 horario inválido', async () => {
    const app = buildApp('cac', buildPoolAuditOnly());
    const res = await request(app)
        .put('/api/directorio/mallas-turnos/nocturno-config')
        .send({ horaInicio: '22:00', horaFin: '22:00' });
    assert.equal(res.status, 400);
});

test('PUT /api/directorio/mallas-turnos/nocturno-config 200 y llama upsert', async () => {
    let payload;
    const app = buildApp('cac', buildPoolAuditOnly(), {
        upsertMallaNocturnoConfig: async (p) => {
            payload = p;
            return {
                horaInicio: p.horaInicio,
                horaFin: p.horaFin,
                cantidadHoras: 8,
                label: '20:00–04:00 (8 h)'
            };
        }
    });
    const res = await request(app)
        .put('/api/directorio/mallas-turnos/nocturno-config')
        .send({ horaInicio: '20:00', horaFin: '04:00' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(payload.horaInicio, '20:00');
    assert.equal(payload.horaFin, '04:00');
});
