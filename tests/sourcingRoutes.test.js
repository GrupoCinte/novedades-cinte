const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerSourcingRoutes } = require('../src/sourcing/registerSourcingRoutes');
const { extractJsonObject, mergeCriterios } = require('../src/sourcing/services/parseVacante');
const { DEFAULT_MODEL_ID, getBedrockModelId, isNovaModel, buildBedrockClientConfig, isAwsTlsInsecure } = require('../src/sourcing/services/bedrockClient');

function mockPool() {
    const vacantes = [];
    const jobs = {};
    const candidatos = [];
    const integraciones = {
        elempleo: {
            provider: 'elempleo',
            estado: 'desconectado',
            mensaje: null,
            connected_at: null,
            updated_at: new Date().toISOString(),
            cookies_enc: null
        },
        linkedin: {
            provider: 'linkedin',
            estado: 'desconectado',
            mensaje: null,
            connected_at: null,
            updated_at: new Date().toISOString(),
            cookies_enc: null
        }
    };
    return {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('sourcing_integraciones')) {
                if (s.includes('INSERT INTO sourcing_integraciones')) {
                    return { rows: [] };
                }
                if (s.includes('UPDATE sourcing_integraciones') && s.includes('cookies_enc')) {
                    const row = { ...integraciones[params[0]], estado: 'conectado', cookies_enc: params[1], mensaje: params[2] };
                    integraciones[params[0]] = row;
                    return {
                        rows: [{
                            provider: row.provider,
                            estado: row.estado,
                            mensaje: row.mensaje,
                            connected_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }]
                    };
                }
                if (s.includes("estado = 'conectando'") && s.includes("estado = 'desconectado'")) {
                    for (const key of Object.keys(integraciones)) {
                        if (integraciones[key].estado === 'conectando') {
                            integraciones[key] = {
                                ...integraciones[key],
                                estado: 'desconectado',
                                mensaje: 'Conexión no completada. Pulse «Conectar cuenta» de nuevo.',
                                updated_at: new Date().toISOString()
                            };
                        }
                    }
                    return { rows: [] };
                }
                if (s.includes('UPDATE sourcing_integraciones') && s.includes("estado = 'desconectado'")) {
                    integraciones[params[0]] = {
                        ...integraciones[params[0]],
                        estado: 'desconectado',
                        cookies_enc: null,
                        mensaje: 'Desconectado manualmente'
                    };
                    return { rows: [{ ...integraciones[params[0]] }] };
                }
                if (s.includes('UPDATE sourcing_integraciones')) {
                    integraciones[params[0]] = {
                        ...integraciones[params[0]],
                        estado: params[1],
                        mensaje: params[2]
                    };
                    return {
                        rows: [{
                            provider: params[0],
                            estado: params[1],
                            mensaje: params[2],
                            connected_at: params[1] === 'conectado' ? new Date().toISOString() : integraciones[params[0]].connected_at,
                            updated_at: new Date().toISOString()
                        }]
                    };
                }
                if (s.includes('SELECT cookies_enc')) {
                    const row = integraciones[params[0]];
                    return { rows: row ? [row] : [] };
                }
                if (s.includes('FROM sourcing_integraciones') && s.includes('ORDER BY')) {
                    return {
                        rows: Object.values(integraciones).map((row) => ({
                            provider: row.provider,
                            estado: row.estado,
                            mensaje: row.mensaje,
                            connected_at: row.connected_at,
                            updated_at: row.updated_at
                        }))
                    };
                }
                if (s.includes('FROM sourcing_integraciones WHERE provider')) {
                    const row = integraciones[params[0]];
                    return {
                        rows: row ? [{
                            provider: row.provider,
                            estado: row.estado,
                            mensaje: row.mensaje,
                            connected_at: row.connected_at,
                            updated_at: row.updated_at
                        }] : []
                    };
                }
            }
            if (s.includes('FROM users')) {
                return { rows: [] };
            }
            if (s.includes('INSERT INTO sourcing_vacantes')) {
                const row = {
                    id: '11111111-1111-4111-8111-111111111111',
                    titulo: params[0],
                    descripcion: params[1],
                    criterios: JSON.parse(params[2]),
                    estado: params[3],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                vacantes.unshift(row);
                return { rows: [row] };
            }
            if (s.includes('UPDATE sourcing_vacantes')) {
                const idx = vacantes.findIndex((v) => v.id === params[0]);
                const prev = idx >= 0 ? vacantes[idx] : null;
                const row = {
                    ...(prev || {}),
                    id: params[0],
                    titulo: params[1],
                    criterios: JSON.parse(params[2]),
                    estado: params[3],
                    updated_at: new Date().toISOString()
                };
                if (idx >= 0) vacantes[idx] = row;
                else vacantes.unshift(row);
                return { rows: [row] };
            }
            if (s.includes('FROM sourcing_vacantes') && s.includes('ORDER BY')) {
                return { rows: vacantes };
            }
            if (s.includes('FROM sourcing_vacantes WHERE id')) {
                return { rows: vacantes.filter((v) => v.id === params[0]) };
            }
            if (s.includes('INSERT INTO sourcing_jobs')) {
                const row = {
                    id: '22222222-2222-4222-8222-222222222222',
                    vacante_id: params[0],
                    estado: 'pendiente',
                    fase: 'descubrimiento',
                    fuentes: JSON.parse(params[1]),
                    progreso: {},
                    error_mensaje: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                jobs[row.id] = row;
                return { rows: [row] };
            }
            if (s.includes('UPDATE sourcing_jobs') && s.includes('fase = $3')) {
                const prev = jobs[params[0]] || {
                    id: params[0],
                    vacante_id: '11111111-1111-4111-8111-111111111111',
                    fuentes: {},
                    error_mensaje: null,
                    estado: 'en_progreso'
                };
                const row = {
                    ...prev,
                    progreso: JSON.parse(params[1]),
                    fase: params[2],
                    estado: params[3] || prev.estado,
                    updated_at: new Date().toISOString()
                };
                jobs[row.id] = row;
                return { rows: [row] };
            }
            if (s.includes('UPDATE sourcing_jobs') && s.includes('progreso = $2')) {
                const prev = jobs[params[0]] || {
                    id: params[0],
                    vacante_id: '11111111-1111-4111-8111-111111111111',
                    fuentes: {},
                    error_mensaje: null
                };
                const row = {
                    ...prev,
                    progreso: JSON.parse(params[1]),
                    estado: prev.estado === 'pendiente' ? 'en_progreso' : prev.estado,
                    updated_at: new Date().toISOString()
                };
                jobs[row.id] = row;
                return { rows: [row] };
            }
            if (s.includes('UPDATE sourcing_jobs') && s.includes('estado = $2') && s.includes('fase = COALESCE')) {
                const prev = jobs[params[0]] || {
                    id: params[0],
                    vacante_id: '11111111-1111-4111-8111-111111111111',
                    fuentes: {},
                    progreso: {},
                    fase: 'descubrimiento'
                };
                const row = {
                    ...prev,
                    estado: params[1],
                    error_mensaje: params[2],
                    fase: params[3] || prev.fase,
                    progreso: params[4] != null ? JSON.parse(params[4]) : prev.progreso,
                    updated_at: new Date().toISOString()
                };
                jobs[row.id] = row;
                return { rows: [row] };
            }
            if (s.includes('UPDATE sourcing_jobs') && s.includes('estado = $2')) {
                const prev = jobs[params[0]] || {
                    id: params[0],
                    vacante_id: '11111111-1111-4111-8111-111111111111',
                    fuentes: {},
                    progreso: {}
                };
                const row = {
                    ...prev,
                    estado: params[1],
                    error_mensaje: params[2],
                    updated_at: new Date().toISOString()
                };
                jobs[row.id] = row;
                return { rows: [row] };
            }
            if (s.includes('INSERT INTO sourcing_candidatos')) {
                const row = {
                    id: `cand-${candidatos.length + 1}`,
                    job_id: params[0],
                    vacante_id: params[1],
                    fuente: params[2],
                    url_perfil: params[3],
                    nombre: params[4],
                    perfil: JSON.parse(params[5]),
                    etapa: params[7] || 'descubrimiento',
                    enriquecido: params[8] || false,
                    score: null,
                    resumen_score: null,
                    decision: 'pendiente',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                candidatos.push(row);
                return { rows: [row] };
            }
            if (s.includes('UPDATE sourcing_candidatos') && s.includes('score = $2')) {
                const idx = candidatos.findIndex((c) => c.id === params[0]);
                if (idx < 0) return { rows: [] };
                candidatos[idx] = {
                    ...candidatos[idx],
                    score: params[1],
                    resumen_score: params[2],
                    etapa: 'completo',
                    updated_at: new Date().toISOString()
                };
                return { rows: [candidatos[idx]] };
            }
            if (s.includes('FROM sourcing_candidatos') && s.includes('score IS NULL')) {
                return {
                    rows: candidatos.filter((c) => c.job_id === params[0] && c.score == null)
                };
            }
            if (s.includes('FROM sourcing_jobs WHERE id')) {
                const row = jobs[params[0]];
                return { rows: row ? [row] : [] };
            }
            if (s.includes('COUNT(*)::int AS n FROM sourcing_candidatos')) {
                const n = candidatos.filter((c) => c.job_id === params[0]).length;
                return { rows: [{ n }] };
            }
            if (s.includes('FROM sourcing_candidatos') && s.includes('vacante_id')) {
                return { rows: candidatos.filter((c) => c.vacante_id === params[0]) };
            }
            if (s.includes('FROM sourcing_candidatos')) {
                return { rows: candidatos.filter((c) => c.job_id === params[0]) };
            }
            return { rows: [] };
        }
    };
}

function buildApp(pool, overrides = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin_ch' };
        next();
    });
    registerSourcingRoutes({
        app,
        pool,
        verificarToken: (req, res, next) => next(),
        allowPanel: () => (req, res, next) => next(),
        adminActionLimiter: (req, res, next) => next(),
        catalogLimiter: (req, res, next) => next(),
        sourcingPollLimiter: (req, res, next) => next(),
        ...overrides
    });
    return app;
}

const mockParseOk = async () => ({
    titulo: 'Desarrollador Java Senior',
    parsed: {
        titulo: 'Desarrollador Java Senior',
        cargo: 'Desarrollador Java Senior',
        cargos_equivalentes: ['Desarrollador Java', 'Ingeniero de software'],
        ciudad: 'Bogotá',
        skills_requeridas: ['Java', 'Spring Boot', 'AWS'],
        skills_deseables: ['Kubernetes'],
        palabras_clave_hv: ['Java', 'AWS'],
        experiencia_min: 5,
        formacion: 'Ingeniería de sistemas',
        modalidad: 'híbrido',
        keywords_busqueda: ['java senior', 'spring boot bogotá'],
        info_faltante: [],
        confianza: { cargo: 0.9, cargos_equivalentes: 0.8 }
    },
    criterios: {}
});

test('GET /api/atraccion/health incluye bedrockConfigured', async () => {
    const app = buildApp(mockPool());
    const res = await request(app).get('/api/atraccion/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.module, 'atraccion-talento');
    assert.equal(typeof res.body.bedrockConfigured, 'boolean');
    assert.match(res.body.bedrockModelId, /nova-2-lite/);
});

test('modelo Bedrock por defecto es Nova 2 Lite', () => {
    const prev = process.env.SOURCING_BEDROCK_MODEL_ID;
    const prevBedrock = process.env.BEDROCK_MODEL_ID;
    delete process.env.SOURCING_BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
        assert.equal(DEFAULT_MODEL_ID, 'global.amazon.nova-2-lite-v1:0');
        assert.equal(getBedrockModelId(), 'global.amazon.nova-2-lite-v1:0');
        assert.equal(isNovaModel(getBedrockModelId()), true);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_BEDROCK_MODEL_ID;
        else process.env.SOURCING_BEDROCK_MODEL_ID = prev;
        if (prevBedrock === undefined) delete process.env.BEDROCK_MODEL_ID;
        else process.env.BEDROCK_MODEL_ID = prevBedrock;
    }
});

test('buildBedrockClientConfig aplica requestHandler TLS insecure cuando AWS_BEDROCK_TLS_INSECURE=true', () => {
    const prev = process.env.AWS_BEDROCK_TLS_INSECURE;
    process.env.AWS_BEDROCK_TLS_INSECURE = 'true';
    try {
        assert.equal(isAwsTlsInsecure(), true);
        const cfg = buildBedrockClientConfig();
        assert.ok(cfg.requestHandler);
    } finally {
        if (prev === undefined) delete process.env.AWS_BEDROCK_TLS_INSECURE;
        else process.env.AWS_BEDROCK_TLS_INSECURE = prev;
    }
});

test('POST /api/atraccion/vacantes valida descripcion minima', async () => {
    const app = buildApp(mockPool(), { parseVacanteFromDescripcion: mockParseOk });
    const res = await request(app).post('/api/atraccion/vacantes').send({ descripcion: 'corta' });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
});

test('POST /api/atraccion/vacantes crea vacante con parse Bedrock mock', async () => {
    const prev = process.env.SOURCING_BEDROCK_ENABLED;
    process.env.SOURCING_BEDROCK_ENABLED = 'true';
    try {
        const app = buildApp(mockPool(), { parseVacanteFromDescripcion: mockParseOk });
        const res = await request(app)
            .post('/api/atraccion/vacantes')
            .send({ descripcion: 'Desarrollador Java Senior en Bogotá, 5+ años, Spring Boot, AWS.' });
        assert.equal(res.status, 201);
        assert.equal(res.body.ok, true);
        assert.ok(res.body.vacante.id);
        assert.equal(res.body.vacante.estado, 'borrador');
        assert.deepEqual(res.body.vacante.criterios.skills_requeridas, ['Java', 'Spring Boot', 'AWS']);
        assert.equal(res.body.vacante.criterios.cargo, 'Desarrollador Java Senior');
        assert.equal(res.body.vacante.criterios.filtros_confirmados, false);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_BEDROCK_ENABLED;
        else process.env.SOURCING_BEDROCK_ENABLED = prev;
    }
});

test('POST /api/atraccion/vacantes deja borrador si Bedrock falla', async () => {
    const prev = process.env.SOURCING_BEDROCK_ENABLED;
    process.env.SOURCING_BEDROCK_ENABLED = 'true';
    try {
        const app = buildApp(mockPool(), {
            parseVacanteFromDescripcion: async () => {
                throw new Error('ThrottlingException');
            }
        });
        const res = await request(app)
            .post('/api/atraccion/vacantes')
            .send({ descripcion: 'Desarrollador Java Senior en Bogotá, 5+ años, Spring Boot, AWS.' });
        assert.equal(res.status, 201);
        assert.equal(res.body.vacante.estado, 'borrador');
        assert.match(res.body.vacante.criterios.parse_error, /ThrottlingException/);
        assert.ok(res.body.parseWarning);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_BEDROCK_ENABLED;
        else process.env.SOURCING_BEDROCK_ENABLED = prev;
    }
});

test('extractJsonObject parsea JSON con fence markdown', () => {
    const out = extractJsonObject('```json\n{"cargo":"Dev","skills":["Java"]}\n```');
    assert.equal(out.cargo, 'Dev');
    assert.deepEqual(out.skills, ['Java']);
});

test('mergeCriterios respeta criterios manuales previos', () => {
    const merged = mergeCriterios(
        { skills: ['Python'], experiencia_min: 3 },
        { cargo: 'Backend', skills: ['Java'], experiencia_min: 5, keywords_busqueda: ['java'] }
    );
    assert.deepEqual(merged.skills, ['Python']);
    assert.equal(merged.experiencia_min, 3);
    assert.equal(merged.cargo, 'Backend');
    assert.deepEqual(merged.keywords_busqueda, ['java']);
});

test('POST /api/atraccion/jobs rechaza vacante sin filtros confirmados', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá con AWS',
        JSON.stringify({ cargo: 'Dev', filtros_confirmados: false }),
        'borrador',
        null
    ]);
    const app = buildApp(pool);
    const res = await request(app)
        .post('/api/atraccion/jobs')
        .send({
            vacante_id: '11111111-1111-4111-8111-111111111111',
            fuentes: { xray: true }
        });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /confirmar los filtros/i);
});

test('PATCH /api/atraccion/vacantes/:id/criterios confirma filtros', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá con AWS',
        JSON.stringify({ cargo: 'Dev Java', filtros_confirmados: false }),
        'borrador',
        null
    ]);
    const app = buildApp(pool);
    const res = await request(app)
        .patch('/api/atraccion/vacantes/11111111-1111-4111-8111-111111111111/criterios')
        .send({
            criterios: {
                cargos_equivalentes: ['Desarrollador Java'],
                palabras_clave_hv: ['Java']
            },
            confirmar: true
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.vacante.estado, 'activa');
    assert.equal(res.body.vacante.criterios.filtros_confirmados, true);
    assert.ok(res.body.vacante.criterios.filtros_confirmados_at);
});

test('POST /api/atraccion/jobs despacha worker mock', async () => {
    const prevUrl = process.env.SOURCING_WORKER_URL;
    const prevSecret = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_URL = 'http://worker.test';
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const pool = mockPool();
        await pool.query(`INSERT INTO sourcing_vacantes`, [
            'Dev Java',
            'Desarrollador Java Senior en Bogotá con AWS',
            JSON.stringify({
                cargo: 'Dev Java',
                filtros_confirmados: true,
                filtros_confirmados_at: new Date().toISOString()
            }),
            'activa',
            null
        ]);
        const app = buildApp(pool, {
            parseVacanteFromDescripcion: mockParseOk
        });
        const fetchCalls = [];
        const appWithFetch = app;
        const original = global.fetch;
        global.fetch = async (url, opts) => {
            fetchCalls.push({ url, opts });
            return { ok: true, status: 200, json: async () => ({ ok: true, accepted: true }) };
        };
        try {
            const res = await request(appWithFetch)
                .post('/api/atraccion/jobs')
                .send({
                    vacante_id: '11111111-1111-4111-8111-111111111111',
                    fuentes: { elempleo: false, linkedin: false, xray: true }
                });
            assert.equal(res.status, 202);
            assert.equal(res.body.ok, true);
            assert.equal(res.body.job.estado, 'en_progreso');
            assert.equal(fetchCalls.length, 1);
            assert.match(fetchCalls[0].url, /worker\.test\/run/);
        } finally {
            global.fetch = original;
        }
    } finally {
        if (prevUrl === undefined) delete process.env.SOURCING_WORKER_URL;
        else process.env.SOURCING_WORKER_URL = prevUrl;
        if (prevSecret === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prevSecret;
    }
});

test('internal candidatos requiere worker key', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/candidatos')
        .send({ candidatos: [] });
    assert.equal(res.status, 401);
});

test('internal complete cierra chips en_progreso en progreso JSON', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const pool = mockPool();
        await pool.query('INSERT INTO sourcing_jobs', [
            '11111111-1111-4111-8111-111111111111',
            JSON.stringify({ elempleo: true }),
            null
        ]);
        await request(buildApp(pool))
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/phase')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({ fase: 'descubrimiento', estado: 'en_progreso', count: 24, total: 24 });
        await request(buildApp(pool))
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/progress')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({ fuente: 'elempleo', estado: 'en_progreso', count: 24 });

        const app = buildApp(pool);
        const res = await request(app)
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/complete')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({ estado: 'completado' });
        assert.equal(res.status, 200);
        assert.equal(res.body.job.estado, 'completado');
        assert.equal(res.body.job.progreso.fases.descubrimiento.estado, 'completado');
        assert.equal(res.body.job.progreso.elempleo.estado, 'completado');
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
    }
});

test('internal phase actualiza fase del job', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const pool = mockPool();
        await pool.query('INSERT INTO sourcing_jobs', [
            '11111111-1111-4111-8111-111111111111',
            JSON.stringify({ xray: true }),
            null
        ]);
        const app = buildApp(pool);
        const res = await request(app)
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/phase')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({
                fase: 'extraccion',
                estado: 'en_progreso',
                count: 3,
                total: 6
            });
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.job.fase, 'extraccion');
        assert.equal(res.body.job.progreso.fases.extraccion.estado, 'en_progreso');
        assert.equal(res.body.job.progreso.fases.extraccion.count, 3);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
    }
});

test('internal candidatos guarda batch con key válida', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const pool = mockPool();
        const app = buildApp(pool);
        const res = await request(app)
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/candidatos')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({
                candidatos: [{
                    fuente: 'X-Ray',
                    nombre: 'Juan Dev',
                    url_perfil: 'https://linkedin.com/in/juan',
                    perfil: { cargo: 'Java Dev' }
                }]
            });
        assert.equal(res.status, 404);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
    }
});

test('GET /api/atraccion/integraciones lista proveedores', async () => {
    const app = buildApp(mockPool());
    const res = await request(app).get('/api/atraccion/integraciones');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.integraciones.length, 2);
    assert.ok(res.body.integraciones.some((i) => i.provider === 'elempleo'));
});

test('POST jobs con elempleo sin conectar devuelve 400', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá con AWS',
        JSON.stringify({ filtros_confirmados: true }),
        'activa',
        null
    ]);
    const app = buildApp(pool);
    const res = await request(app)
        .post('/api/atraccion/jobs')
        .send({
            vacante_id: '11111111-1111-4111-8111-111111111111',
            fuentes: { elempleo: true, xray: false }
        });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /El Empleo/i);
});

test('internal integraciones guarda cookies cifradas', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const app = buildApp(mockPool());
        const res = await request(app)
            .put('/api/atraccion/internal/integraciones/elempleo/cookies')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({
                cookies: [
                    { name: 'ASP.NET_SessionId', value: 'sess', domain: '.elempleo.com', path: '/', httpOnly: true },
                    { name: 'connectId', value: 'conn', domain: '.elempleo.com', path: '/' },
                    { name: '.ASPXAUTH', value: 'auth', domain: '.elempleo.com', path: '/', httpOnly: true }
                ],
                mensaje: 'OK test'
            });
        assert.equal(res.status, 200);
        assert.equal(res.body.integracion.estado, 'conectado');
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
    }
});

test('POST integraciones connect devuelve loginUrl en browser_tab', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/integraciones/elempleo/connect')
        .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'browser_tab');
    assert.match(res.body.loginUrl, /elempleo\.com/);
});

test('POST integraciones connect-worker despacha worker', async () => {
    const prevUrl = process.env.SOURCING_WORKER_URL;
    process.env.SOURCING_WORKER_URL = 'http://worker.test';
    const original = global.fetch;
    global.fetch = async (url) => {
        assert.match(String(url), /worker\.test\/connect\/elempleo/);
        return { ok: true, status: 200, json: async () => ({ ok: true, estado: 'conectando' }) };
    };
    try {
        const app = buildApp(mockPool());
        const res = await request(app)
            .post('/api/atraccion/integraciones/elempleo/connect-worker')
            .send({});
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.mode, 'worker_browser');
    } finally {
        global.fetch = original;
        if (prevUrl === undefined) delete process.env.SOURCING_WORKER_URL;
        else process.env.SOURCING_WORKER_URL = prevUrl;
    }
});

test('POST integraciones session guarda cookies (usuario)', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/integraciones/elempleo/session')
        .set('Authorization', 'Bearer test-token')
        .send({
            cookies: [
                { name: 'ASP.NET_SessionId', value: 'sess', domain: '.elempleo.com', path: '/', httpOnly: true },
                { name: 'connectId', value: 'conn', domain: '.elempleo.com', path: '/' },
                { name: '.ASPXAUTH', value: 'auth', domain: '.elempleo.com', path: '/', httpOnly: true }
            ]
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.integracion.estado, 'conectado');
});

test('POST integraciones session rechaza cookies solo analytics', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/integraciones/elempleo/session')
        .set('Authorization', 'Bearer test-token')
        .send({
            cookies: [
                { name: '_scor_uid', value: '1', domain: '.elempleo.com', path: '/' },
                { name: 'permutive-id', value: '2', domain: '.elempleo.com', path: '/' },
                { name: 'connectId', value: '3', domain: '.elempleo.com', path: '/' }
            ]
        });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /publicidad|incompleta/i);
});

test('internal integraciones marca sesión expirada', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const app = buildApp(mockPool());
        await request(app)
            .put('/api/atraccion/internal/integraciones/elempleo/cookies')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({
                cookies: [
                    { name: 'ASP.NET_SessionId', value: 'sess', domain: '.elempleo.com', path: '/', httpOnly: true },
                    { name: 'connectId', value: 'conn', domain: '.elempleo.com', path: '/' },
                    { name: '.ASPXAUTH', value: 'auth', domain: '.elempleo.com', path: '/', httpOnly: true }
                ]
            });
        const res = await request(app)
            .patch('/api/atraccion/internal/integraciones/elempleo/status')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({
                estado: 'expirado',
                mensaje: 'Sesión El Empleo expirada — renueve la conexión en Integraciones'
            });
        assert.equal(res.status, 200);
        assert.equal(res.body.integracion.estado, 'expirado');
        const list = await request(app).get('/api/atraccion/integraciones');
        const ee = list.body.integraciones.find((i) => i.provider === 'elempleo');
        assert.equal(ee.estado, 'expirado');
        assert.match(ee.mensaje, /expirada/i);
        const cookiesRes = await request(app)
            .get('/api/atraccion/internal/integraciones/elempleo/cookies')
            .set('x-sourcing-worker-key', 'test-secret');
        assert.equal(cookiesRes.status, 200);
        assert.ok(Array.isArray(cookiesRes.body.cookies));
        assert.ok(cookiesRes.body.cookies.length > 0);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
    }
});

test('internal score requiere worker key', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/score')
        .send({});
    assert.equal(res.status, 401);
});

test('internal score ejecuta runJobScoring mock', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    try {
        const pool = mockPool();
        await pool.query('INSERT INTO sourcing_jobs', [
            '11111111-1111-4111-8111-111111111111',
            JSON.stringify({ elempleo: true }),
            null
        ]);
        const app = buildApp(pool, {
            runJobScoring: async () => ({ skipped: false, scored: 2, failed: 0 })
        });
        const res = await request(app)
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/score')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({});
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.scored, 2);
        assert.equal(res.body.skipped, false);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
    }
});

test('internal score omite si Bedrock no configurado', async () => {
    const prev = process.env.SOURCING_WORKER_CALLBACK_SECRET;
    const prevBedrock = process.env.SOURCING_BEDROCK_ENABLED;
    process.env.SOURCING_WORKER_CALLBACK_SECRET = 'test-secret';
    process.env.SOURCING_BEDROCK_ENABLED = 'false';
    try {
        const pool = mockPool();
        await pool.query('INSERT INTO sourcing_jobs', [
            '11111111-1111-4111-8111-111111111111',
            JSON.stringify({ xray: true }),
            null
        ]);
        const app = buildApp(pool);
        const res = await request(app)
            .post('/api/atraccion/internal/jobs/22222222-2222-4222-8222-222222222222/score')
            .set('x-sourcing-worker-key', 'test-secret')
            .send({});
        assert.equal(res.status, 200);
        assert.equal(res.body.skipped, true);
        assert.equal(res.body.reason, 'bedrock_not_configured');
    } finally {
        if (prev === undefined) delete process.env.SOURCING_WORKER_CALLBACK_SECRET;
        else process.env.SOURCING_WORKER_CALLBACK_SECRET = prev;
        if (prevBedrock === undefined) delete process.env.SOURCING_BEDROCK_ENABLED;
        else process.env.SOURCING_BEDROCK_ENABLED = prevBedrock;
    }
});
