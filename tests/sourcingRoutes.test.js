const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { registerSourcingRoutes } = require('../src/sourcing/registerSourcingRoutes');
const { extractJsonObject, mergeCriterios } = require('../src/sourcing/services/parseVacante');
const { DEFAULT_MODEL_ID, getBedrockModelId, isNovaModel, buildBedrockClientConfig, isAwsTlsInsecure } = require('../src/sourcing/services/bedrockClient');

// Criterios que superan el gate de filtros obligatorios (formación, experiencia,
// seniority, modalidad, ciudad, tipo de contrato y salario).
const CRITERIOS_COMPLETOS = {
    cargo: 'Dev Java',
    ciudad: 'Bogotá',
    experiencia_min: 3,
    seniority: 'Senior',
    modalidad: 'híbrido',
    tipo_contrato: 'término indefinido',
    formacion: 'Ingeniería de sistemas',
    salario_rangos_cop: ['3.000.000 - 4.500.000'],
    filtros_confirmados: true,
    filtros_confirmados_at: new Date().toISOString()
};

function mockPool() {
    const vacantes = [];
    const jobs = {};
    const candidatos = [];
    const campanas = {};
    const destinatarios = [];
    const preentrevistas = [];
    const preMensajes = [];
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
        },
        zoho_recruit: {
            provider: 'zoho_recruit',
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
                    if (s.includes('zoho_recruit')) {
                        const row = integraciones.zoho_recruit || { cookies_enc: null, estado: 'desconectado' };
                        return { rows: [row] };
                    }
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
            if (s.includes('UPDATE sourcing_vacantes') && s.includes("estado = 'archivada'")) {
                const idx = vacantes.findIndex((v) => v.id === params[0]);
                if (idx < 0) return { rows: [] };
                vacantes[idx] = {
                    ...vacantes[idx],
                    estado: 'archivada',
                    updated_at: new Date().toISOString()
                };
                return { rows: [vacantes[idx]] };
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
                if (s.includes("estado <> 'archivada'")) {
                    return { rows: vacantes.filter((v) => v.estado !== 'archivada') };
                }
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
                    id: `cccccccc-cccc-4ccc-8ccc-${String(candidatos.length + 1).padStart(12, '0')}`,
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
            if (s.includes('UPDATE sourcing_candidatos') && s.includes('decision = $2')) {
                const idx = candidatos.findIndex((c) => c.id === params[0]);
                if (idx < 0) return { rows: [] };
                candidatos[idx] = {
                    ...candidatos[idx],
                    decision: params[1],
                    updated_at: new Date().toISOString()
                };
                return { rows: [{ id: candidatos[idx].id, decision: candidatos[idx].decision }] };
            }
            if (s.includes('FROM sourcing_candidatos') && s.includes('WHERE id = $1::uuid') && !s.includes('ANY')) {
                return { rows: candidatos.filter((c) => c.id === params[0]) };
            }
            if (s.includes('FROM sourcing_candidatos') && s.includes('ANY($1::uuid[])')) {
                const ids = params[0] || [];
                return { rows: candidatos.filter((c) => ids.includes(c.id)) };
            }
            if (s.includes('FROM sourcing_candidatos c') && s.includes('JOIN sourcing_vacantes v')) {
                // Base de captura: todos los candidatos con datos de la vacante.
                const rows = candidatos.map((c) => {
                    const vac = vacantes.find((v) => v.id === c.vacante_id) || {};
                    return {
                        ...c,
                        vacante_titulo: vac.titulo || null,
                        vacante_codigo: vac.codigo || null,
                        vacante_estado: vac.estado || null
                    };
                });
                return { rows };
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

            // --- Campañas ---
            if (s.includes('INSERT INTO sourcing_campanas')) {
                const row = {
                    id: `camp-${Object.keys(campanas).length + 1}`,
                    nombre: params[0],
                    canal_default: params[1],
                    mensaje_plantilla: params[2],
                    plantillas: params[3] ? JSON.parse(params[3]) : {},
                    estado: 'borrador',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                campanas[row.id] = row;
                return { rows: [row] };
            }
            if (s.includes('SELECT id FROM sourcing_campana_destinatarios')
                && s.includes('candidato_id = $2')) {
                return {
                    rows: destinatarios.filter((d) => d.campana_id === params[0] && d.candidato_id === params[1])
                };
            }
            if (s.includes('INSERT INTO sourcing_campana_destinatarios') && s.includes('correo') && s.includes('NULL')) {
                const row = {
                    id: `dest-${destinatarios.length + 1}`,
                    campana_id: params[0],
                    candidato_id: null,
                    nombre: params[1],
                    canal: params[2],
                    contacto: params[3],
                    correo: params[4],
                    mensaje: params[5],
                    estado: 'pendiente',
                    error_mensaje: null,
                    enviado_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                destinatarios.push(row);
                return { rows: [row] };
            }
            if (s.includes('INSERT INTO sourcing_campana_destinatarios')) {
                const row = {
                    id: `dest-${destinatarios.length + 1}`,
                    campana_id: params[0],
                    candidato_id: params[1],
                    nombre: params[2],
                    canal: params[3],
                    contacto: params[4],
                    correo: null,
                    mensaje: params[5],
                    estado: 'pendiente',
                    error_mensaje: null,
                    enviado_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                destinatarios.push(row);
                return { rows: [row] };
            }
            if (s.includes('FROM sourcing_campanas c') && s.includes('LEFT JOIN')) {
                return {
                    rows: Object.values(campanas).map((c) => {
                        const dest = destinatarios.filter((d) => d.campana_id === c.id);
                        return {
                            ...c,
                            total_destinatarios: dest.length,
                            enviados: dest.filter((d) => d.estado === 'enviado').length
                        };
                    })
                };
            }
            if (s.includes('FROM sourcing_campanas WHERE id')) {
                const row = campanas[params[0]];
                return { rows: row ? [row] : [] };
            }
            if (s.includes('FROM sourcing_campana_destinatarios') && s.includes('ORDER BY created_at ASC')) {
                return { rows: destinatarios.filter((d) => d.campana_id === params[0]) };
            }
            if (s.includes('DELETE FROM sourcing_campana_destinatarios')) {
                const idx = destinatarios.findIndex((d) => d.id === params[1] && d.campana_id === params[0]);
                if (idx < 0) return { rows: [] };
                const [removed] = destinatarios.splice(idx, 1);
                return { rows: [{ id: removed.id }] };
            }
            if (s.includes('UPDATE sourcing_campana_destinatarios')) {
                const idx = destinatarios.findIndex((d) => d.id === params[1] && d.campana_id === params[0]);
                if (idx < 0) return { rows: [] };
                destinatarios[idx] = {
                    ...destinatarios[idx],
                    estado: params[2],
                    error_mensaje: params[3],
                    enviado_at: params[2] === 'enviado' ? new Date().toISOString() : destinatarios[idx].enviado_at,
                    updated_at: new Date().toISOString()
                };
                return { rows: [destinatarios[idx]] };
            }
            if (s.includes('COUNT(*)::int AS total') && s.includes('FROM sourcing_campana_destinatarios')) {
                const dest = destinatarios.filter((d) => d.campana_id === params[0]);
                return {
                    rows: [{
                        total: dest.length,
                        enviados: dest.filter((d) => d.estado === 'enviado').length,
                        pendientes: dest.filter((d) => d.estado === 'pendiente').length
                    }]
                };
            }
            if (s.includes('UPDATE sourcing_campanas SET estado')) {
                const row = campanas[params[0]];
                if (!row) return { rows: [] };
                campanas[params[0]] = { ...row, estado: params[1], updated_at: new Date().toISOString() };
                return { rows: [campanas[params[0]]] };
            }
            if (s.includes('UPDATE sourcing_campanas SET') && !s.includes('estado')) {
                const row = campanas[params[0]];
                if (!row) return { rows: [] };
                let i = 1;
                if (s.includes('nombre =')) { row.nombre = params[i++]; }
                if (s.includes('mensaje_plantilla =')) { row.mensaje_plantilla = params[i++]; }
                if (s.includes('plantillas =')) { row.plantillas = params[i] ? JSON.parse(params[i]) : {}; i++; }
                row.updated_at = new Date().toISOString();
                campanas[params[0]] = row;
                return { rows: [row] };
            }

            // --- Preentrevistas ---
            if (s.includes('FROM sourcing_preentrevistas') && s.includes('destinatario_id = $1')
                && !s.includes('INSERT')) {
                return { rows: preentrevistas.filter((p) => p.destinatario_id === params[0]) };
            }
            if (s.includes('INSERT INTO sourcing_preentrevistas')) {
                const row = {
                    id: `pre-${preentrevistas.length + 1}`,
                    destinatario_id: params[0] || null,
                    campana_id: params[1] || null,
                    candidato_id: params[2] || null,
                    telefono: params[3] || null,
                    fase: params[4] || 'apertura',
                    estado: 'en_curso',
                    interes: null,
                    datos: {},
                    cv_url: null,
                    entrevista: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                preentrevistas.push(row);
                return { rows: [row] };
            }
            if (s.includes('FROM sourcing_preentrevistas') && s.includes('WHERE id = $1')) {
                return { rows: preentrevistas.filter((p) => p.id === params[0]) };
            }
            if (s.includes('FROM sourcing_preentrevistas') && s.includes('regexp_replace')) {
                const digits = params[0];
                return {
                    rows: preentrevistas.filter((p) => String(p.telefono || '').replace(/\D/g, '') === digits)
                };
            }
            if (s.includes('UPDATE sourcing_preentrevistas SET')) {
                const idx = preentrevistas.findIndex((p) => p.id === params[0]);
                if (idx < 0) return { rows: [] };
                let i = 1;
                if (s.includes('fase =')) { preentrevistas[idx].fase = params[i++]; }
                if (s.includes('estado =')) { preentrevistas[idx].estado = params[i++]; }
                if (s.includes('interes =')) { preentrevistas[idx].interes = params[i++]; }
                if (s.includes('datos =')) { preentrevistas[idx].datos = params[i] ? JSON.parse(params[i]) : {}; i++; }
                if (s.includes('cv_url =')) { preentrevistas[idx].cv_url = params[i++]; }
                if (s.includes('entrevista =')) { preentrevistas[idx].entrevista = params[i] ? JSON.parse(params[i]) : null; i++; }
                preentrevistas[idx].updated_at = new Date().toISOString();
                return { rows: [preentrevistas[idx]] };
            }
            if (s.includes('INSERT INTO sourcing_preentrevista_mensajes')) {
                const row = {
                    id: `msg-${preMensajes.length + 1}`,
                    preentrevista_id: params[0],
                    rol: params[1],
                    texto: params[2],
                    created_at: new Date().toISOString()
                };
                preMensajes.push(row);
                return { rows: [row] };
            }
            if (s.includes('INSERT INTO sourcing_flujos')) {
                const row = {
                    id: '33333333-3333-4333-8333-333333333333',
                    nombre: params[0],
                    descripcion: params[1],
                    pasos_json: JSON.parse(params[2]),
                    created_at: new Date().toISOString()
                };
                return { rows: [row] };
            }
            if (s.includes('INSERT INTO sourcing_decisiones_entrenamiento')) {
                return { rows: [{ id: 'dec-1' }] };
            }
            if (s.includes('FROM sourcing_flujos')) {
                return { rows: [] };
            }
            if (s.includes('DELETE FROM sourcing_flujos')) {
                return { rows: [{ id: params[0] }] };
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

test('POST /api/atraccion/vacantes/:id/archivar marca archivada y la excluye del listado', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá con AWS',
        JSON.stringify({ cargo: 'Dev Java' }),
        'activa',
        null
    ]);
    const app = buildApp(pool);
    const res = await request(app)
        .post('/api/atraccion/vacantes/11111111-1111-4111-8111-111111111111/archivar')
        .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.vacante.estado, 'archivada');

    const list = await request(app).get('/api/atraccion/vacantes');
    assert.equal(list.status, 200);
    assert.equal(list.body.vacantes.length, 0);
});

test('POST /api/atraccion/vacantes/:id/archivar 404 si no existe', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/vacantes/99999999-9999-4999-8999-999999999999/archivar')
        .send({});
    assert.equal(res.status, 404);
});

test('POST /api/atraccion/jobs bloquea si faltan filtros obligatorios', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá con AWS',
        JSON.stringify({ cargo: 'Dev', ciudad: 'Bogotá', filtros_confirmados: true }),
        'activa',
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
    assert.match(res.body.error, /obligatorios/i);
    assert.ok(Array.isArray(res.body.filtros_faltantes));
    assert.ok(res.body.filtros_faltantes.length > 0);
});

test('GET /api/atraccion/captura incluye candidatos de vacantes archivadas', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá',
        JSON.stringify({ cargo: 'Dev' }),
        'archivada',
        null
    ]);
    await pool.query(`INSERT INTO sourcing_candidatos`, [
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'X-Ray',
        'https://linkedin.com/in/ana',
        'Ana Dev',
        JSON.stringify({ cargo: 'Java Dev' }),
        null,
        'descubrimiento',
        false
    ]);
    const app = buildApp(pool);
    const res = await request(app).get('/api/atraccion/captura');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.candidatos.length, 1);
    assert.equal(res.body.candidatos[0].vacante_estado, 'archivada');
});

test('flujo campaña: crear, listar, marcar destinatario y enviar (manual)', async () => {
    const prevWebhook = process.env.N8N_CONTACTO_WEBHOOK_URL;
    const prevAgent = process.env.N8N_ATCONTACTO_WEBHOOK_URL;
    const prevEnvio = process.env.ATRACCION_CAMPANA_ENVIO;
    delete process.env.N8N_CONTACTO_WEBHOOK_URL;
    delete process.env.N8N_ATCONTACTO_WEBHOOK_URL;
    delete process.env.ATRACCION_CAMPANA_ENVIO;
    try {
        const pool = mockPool();
        await pool.query(`INSERT INTO sourcing_vacantes`, [
            'Dev Java',
            'Desarrollador Java Senior en Bogotá',
            JSON.stringify({ cargo: 'Dev' }),
            'activa',
            null
        ]);
        await pool.query(`INSERT INTO sourcing_candidatos`, [
            '22222222-2222-4222-8222-222222222222',
            '11111111-1111-4111-8111-111111111111',
            'El Empleo',
            'https://elempleo.com/hv/ana',
            'Ana Dev',
            JSON.stringify({ telefono: '3001234567' }),
            null,
            'descubrimiento',
            false
        ]);
        const app = buildApp(pool);

        const candId = 'cccccccc-cccc-4ccc-8ccc-000000000001';

        // Sin aprobar, la campaña debe bloquearse (solo aprobados pasan).
        const blocked = await request(app)
            .post('/api/atraccion/campanas')
            .send({ nombre: 'Campaña Bloqueada', candidato_ids: [candId] });
        assert.equal(blocked.status, 400);

        // Aprobar el candidato habilita la campaña.
        const decision = await request(app)
            .patch(`/api/atraccion/candidatos/${candId}/decision`)
            .send({ decision: 'aprobado' });
        assert.equal(decision.status, 200);
        assert.equal(decision.body.decision, 'aprobado');

        const create = await request(app)
            .post('/api/atraccion/campanas')
            .send({ nombre: 'Campaña Test', mensaje_plantilla: 'Hola {nombre}', candidato_ids: [candId] });
        assert.equal(create.status, 201);
        assert.equal(create.body.ok, true);
        assert.equal(create.body.campana.destinatarios.length, 1);
        assert.equal(create.body.campana.destinatarios[0].canal, 'whatsapp');
        assert.equal(create.body.campana.destinatarios[0].contacto, '3001234567');
        const campanaId = create.body.campana.id;

        const list = await request(app).get('/api/atraccion/campanas');
        assert.equal(list.status, 200);
        assert.equal(list.body.campanas.length, 1);
        assert.equal(list.body.campanas[0].total_destinatarios, 1);

        const destId = create.body.campana.destinatarios[0].id;
        const patch = await request(app)
            .patch(`/api/atraccion/campanas/${campanaId}/destinatarios/${destId}`)
            .send({ estado: 'enviado' });
        assert.equal(patch.status, 200);
        assert.equal(patch.body.destinatario.estado, 'enviado');
        assert.equal(patch.body.campana.estado, 'enviada');

        // Editar plantillas por fase (PATCH campaña).
        const editada = await request(app)
            .patch(`/api/atraccion/campanas/${campanaId}`)
            .send({ plantillas: { apertura: 'Hola [NOMBRE_CANDIDATO]', oferta: 'Rol: [NOMBRE_CARGO]' } });
        assert.equal(editada.status, 200);
        assert.equal(editada.body.campana.plantillas.apertura, 'Hola [NOMBRE_CANDIDATO]');

        // Agregar un segundo candidato aprobado a la campaña existente.
        await pool.query(`INSERT INTO sourcing_candidatos`, [
            '11111111-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111',
            'El Empleo',
            'https://elempleo.com/hv/luis',
            'Luis Dev',
            JSON.stringify({ telefono: '3009998888' }),
            null,
            'descubrimiento',
            false
        ]);
        const candId2 = 'cccccccc-cccc-4ccc-8ccc-000000000002';
        await request(app).patch(`/api/atraccion/candidatos/${candId2}/decision`).send({ decision: 'aprobado' });
        const add = await request(app)
            .post(`/api/atraccion/campanas/${campanaId}/destinatarios`)
            .send({ candidato_ids: [candId2] });
        assert.equal(add.status, 200);
        assert.equal(add.body.agregados, 1);
        assert.equal(add.body.campana.destinatarios.length, 2);

        // Alta manual: nombre + correo + número.
        const addManual = await request(app)
            .post(`/api/atraccion/campanas/${campanaId}/destinatarios`)
            .send({ manuales: [{ nombre: 'Contacto Manual', correo: 'manual@test.com', telefono: '3007776666' }] });
        assert.equal(addManual.status, 200);
        assert.equal(addManual.body.agregados, 1);
        assert.equal(addManual.body.campana.destinatarios.length, 3);
        const manual = addManual.body.campana.destinatarios.find((d) => d.nombre === 'Contacto Manual');
        assert.equal(manual.canal, 'whatsapp');
        assert.equal(manual.contacto, '3007776666');
        assert.equal(manual.correo, 'manual@test.com');

        // Eliminar un destinatario de la campaña.
        const del = await request(app)
            .delete(`/api/atraccion/campanas/${campanaId}/destinatarios/${manual.id}`);
        assert.equal(del.status, 200);
        assert.equal(del.body.ok, true);
        assert.equal(del.body.campana.destinatarios.length, 2);

        const enviar = await request(app).post(`/api/atraccion/campanas/${campanaId}/enviar`).send({});
        assert.equal(enviar.status, 200);
        assert.equal(enviar.body.dispatched, false);
    } finally {
        if (prevWebhook === undefined) delete process.env.N8N_CONTACTO_WEBHOOK_URL;
        else process.env.N8N_CONTACTO_WEBHOOK_URL = prevWebhook;
        if (prevAgent === undefined) delete process.env.N8N_ATCONTACTO_WEBHOOK_URL;
        else process.env.N8N_ATCONTACTO_WEBHOOK_URL = prevAgent;
        if (prevEnvio === undefined) delete process.env.ATRACCION_CAMPANA_ENVIO;
        else process.env.ATRACCION_CAMPANA_ENVIO = prevEnvio;
    }
});

test('intake de contacto AT actualiza la preentrevista', async () => {
    const prevKey = process.env.ATCONTACTO_INGEST_KEY;
    process.env.ATCONTACTO_INGEST_KEY = 'test-intake-key';
    try {
        const pool = mockPool();
        const app = buildApp(pool);

        // Sin key → 401.
        const noauth = await request(app)
            .post('/api/atraccion/contacto/intake')
            .send({ destinatario_id: 'dddddddd-dddd-4ddd-8ddd-000000000001', fase: 'formulario' });
        assert.equal(noauth.status, 401);

        // Con key + destinatario_id → crea preentrevista y avanza fase/datos.
        const ok = await request(app)
            .post('/api/atraccion/contacto/intake')
            .set('x-atcontacto-key', 'test-intake-key')
            .send({
                destinatario_id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
                fase: 'formulario',
                estado: 'interesado',
                datos: { ciudad_residencia: 'Bogotá' },
                mensaje: { rol: 'candidato', texto: 'Sí, me interesa' }
            });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.ok, true);
        assert.equal(ok.body.preentrevista.fase, 'formulario');
        assert.equal(ok.body.preentrevista.estado, 'interesado');
        assert.equal(ok.body.preentrevista.datos.ciudad_residencia, 'Bogotá');
    } finally {
        if (prevKey === undefined) delete process.env.ATCONTACTO_INGEST_KEY;
        else process.env.ATCONTACTO_INGEST_KEY = prevKey;
    }
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
            JSON.stringify(CRITERIOS_COMPLETOS),
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
    assert.equal(res.body.integraciones.length, 3);
    assert.ok(res.body.integraciones.some((i) => i.provider === 'elempleo'));
});

test('POST jobs con elempleo sin conectar devuelve 400', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá con AWS',
        JSON.stringify(CRITERIOS_COMPLETOS),
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

test('GET health incluye flags paridad ScrapingAT', async () => {
    const app = buildApp(mockPool());
    const res = await request(app).get('/api/atraccion/health');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.scoreMin, 'number');
    assert.equal(typeof res.body.pushZoho, 'boolean');
    assert.equal(typeof res.body.inmailAuto, 'boolean');
});

test('POST postulaciones rechaza URL sin panel empresas', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/jobs/postulaciones')
        .send({
            vacante_id: '11111111-1111-4111-8111-111111111111',
            url_oferta: 'https://www.elempleo.com/co/ofertas-trabajo/dev-java'
        });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /empresas/i);
});

test('POST jobs con zoho sin conectar devuelve 400', async () => {
    const pool = mockPool();
    await pool.query(`INSERT INTO sourcing_vacantes`, [
        'Dev Java',
        'Desarrollador Java Senior en Bogotá',
        JSON.stringify(CRITERIOS_COMPLETOS),
        'activa',
        null
    ]);
    const app = buildApp(pool);
    const res = await request(app)
        .post('/api/atraccion/jobs')
        .send({
            vacante_id: '11111111-1111-4111-8111-111111111111',
            fuentes: { zoho: true, xray: false }
        });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Zoho/i);
});

test('POST flujos crea secuencia', async () => {
    const app = buildApp(mockPool());
    const res = await request(app)
        .post('/api/atraccion/flujos')
        .send({
            nombre: 'InMail + WA',
            pasos: [{ orden: 1, canal: 'inmail', plantilla: 'Hola [nombre]' }]
        });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.flujo.nombre, 'InMail + WA');
});

test('GET flujos lista vacía inicial', async () => {
    const app = buildApp(mockPool());
    const res = await request(app).get('/api/atraccion/flujos');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(Array.isArray(res.body.flujos));
});
