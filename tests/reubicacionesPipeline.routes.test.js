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

function buildPoolListNoSearch(options = {}) {
    const { tipoFichaMatch, tipoFichaOptions } = options;
    return {
        query: async (sql, params = []) => {
            const s = String(sql).replace(/\s+/g, ' ');
            if (/SELECT COUNT\(\*\)::int AS total/i.test(sql) && /FROM reubicaciones_pipeline rp/i.test(sql)) {
                if (tipoFichaMatch != null) {
                    const matchParam = params.some((p) => String(p || '').trim().toLowerCase() === String(tipoFichaMatch).trim().toLowerCase());
                    return { rows: [{ total: matchParam ? 1 : 0 }] };
                }
                return { rows: [{ total: 1 }] };
            }

            if (/SELECT DISTINCT tipo_ficha/i.test(sql)) {
                return {
                    rows: (Array.isArray(tipoFichaOptions) ? tipoFichaOptions : []).map((tipo_ficha) => ({ tipo_ficha }))
                };
            }

            if (/FROM reubicaciones_pipeline rp INNER JOIN colaboradores c/i.test(s) && /LIMIT/i.test(s)) {
                if (tipoFichaMatch != null) {
                    const matchParam = params.some((p) => String(p || '').trim().toLowerCase() === String(tipoFichaMatch).trim().toLowerCase());
                    if (!matchParam) {
                        return { rows: [] };
                    }
                }
                return {
                    rows: [
                        {
                            id: '11111111-1111-4111-8111-111111111111',
                            cedula: '1234567890',
                            fecha_fin: new Date('2026-08-15'),
                            cliente_destino: 'Destino SA',
                            causal: 'Cierre',
                            created_at: new Date('2026-01-01'),
                            updated_at: new Date('2026-01-02'),
                            consultor: 'Ana López',
                            tipo_contrato: 'Obra labor',
                            cliente_actual: 'Cliente Origen',
                            tarifa_cliente: '150000',
                            montos_divisa: { tarifa_cliente: 'COP' },
                            dias_restantes: 20
                        }
                    ]
                };
            }
            if (/INSERT INTO reubicaciones_pipeline/i.test(sql)) {
                return {
                    rows: [
                        {
                            id: '22222222-2222-4222-8222-222222222222',
                            cedula: '9876543210',
                            fecha_fin: new Date('2026-09-01'),
                            cliente_destino: null,
                            causal: null,
                            created_at: new Date(),
                            updated_at: new Date()
                        }
                    ]
                };
            }
            if (/FROM reubicaciones_pipeline rp[\s\S]*WHERE rp\.id = \$1::uuid/i.test(sql)) {
                return {
                    rows: [
                        {
                            id: '22222222-2222-4222-8222-222222222222',
                            cedula: '9876543210',
                            fecha_fin: new Date('2026-09-01'),
                            cliente_destino: null,
                            causal: null,
                            created_at: new Date(),
                            updated_at: new Date(),
                            consultor: 'Beta',
                            tipo_contrato: 'T',
                            cliente_actual: 'C',
                            tarifa_cliente: null,
                            montos_divisa: null,
                            dias_restantes: 40
                        }
                    ]
                };
            }
            if (/INSERT INTO audit_log/i.test(sql)) {
                return { rows: [] };
            }
            return { rows: [] };
        }
    };
}

function buildApp(role, pool) {
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
        listMallaTurnosCeldasRange: async () => [],
        upsertMallaTurnosCeldas: async () => {},
        getMallaTurnoAprobacionStatus: async () => ({
            aprobada: false,
            aprobadoEn: null,
            novedadesGeneradas: 0,
            aprobadoPorEmail: null
        }),
        getMallaNocturnoConfig: async () => ({
            horaInicio: '22:00',
            horaFin: '06:00',
            cantidadHoras: 8,
            label: '22:00–06:00 (8 h)'
        }),
        upsertMallaNocturnoConfig: async () => ({})
    });
    return app;
}

test('GET /api/directorio/reubicaciones-pipeline 403 para rol gp', async () => {
    const app = buildApp('gp', buildPoolListNoSearch());
    const res = await request(app).get('/api/directorio/reubicaciones-pipeline');
    assert.equal(res.status, 403);
});

test('GET /api/directorio/reubicaciones-pipeline 200 super_admin con contrato', async () => {
    const app = buildApp('super_admin', buildPoolListNoSearch());
    const res = await request(app).get('/api/directorio/reubicaciones-pipeline');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.total, 1);
    assert.equal(Array.isArray(res.body.items), true);
    assert.equal(res.body.items.length, 1);
    const it = res.body.items[0];
    assert.equal(it.cedula, '1234567890');
    assert.equal(it.consultor, 'Ana López');
    assert.equal(it.semaforo, 'Amarillo');
    assert.equal(it.dias_restantes, 20);
});

test('GET /api/directorio/reubicaciones-pipeline/tipo-ficha-opciones 200 super_admin', async () => {
    const app = buildApp('super_admin', buildPoolListNoSearch({ tipoFichaOptions: ['Alta', 'Renovación'] }));
    const res = await request(app).get('/api/directorio/reubicaciones-pipeline/tipo-ficha-opciones');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.items, ['Alta', 'Renovación']);
});

test('GET /api/directorio/reubicaciones-pipeline 200 filtra por tipo_ficha', async () => {
    const app = buildApp('super_admin', buildPoolListNoSearch({ tipoFichaMatch: 'Alta' }));
    const res = await request(app)
        .get('/api/directorio/reubicaciones-pipeline')
        .query({ tipo_ficha: 'Alta' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items.length, 1);
});

test('GET /api/directorio/reubicaciones-pipeline 200 devuelve vacio para tipo_ficha no coincidente', async () => {
    const app = buildApp('super_admin', buildPoolListNoSearch({ tipoFichaMatch: 'Alta' }));
    const res = await request(app)
        .get('/api/directorio/reubicaciones-pipeline')
        .query({ tipo_ficha: 'Baja' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.items.length, 0);
});

test('POST /api/directorio/reubicaciones-pipeline 201 super_admin', async () => {
    const app = buildApp('super_admin', buildPoolListNoSearch());
    const res = await request(app)
        .post('/api/directorio/reubicaciones-pipeline')
        .send({
            cedula: '9876543210',
            fecha_fin: '2026-09-01',
            cliente_destino: '',
            causal: ''
        });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.item.cedula, '9876543210');
    assert.equal(res.body.item.semaforo, 'Verde');
});
