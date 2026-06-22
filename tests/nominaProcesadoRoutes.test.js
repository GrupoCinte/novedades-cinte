const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('node:path');
const fs = require('node:fs');
const { registerRoutes } = require('../src/registerRoutes');
const { toClientNovedad } = require('../src/novedadesMapper');
const {
    markNominaProcesado,
    canMarkNominaProcesadoRole,
    parseIdList
} = require('../src/nominaProcesadoService');

const NOV_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOV_ID_2 = '660e8400-e29b-41d4-a716-446655440001';

function limiter(_req, _res, next) {
    next();
}

function buildMockPool() {
    const marked = new Set();
    return {
        marked,
        query: async (sql, params) => {
            if (/SELECT id FROM users/.test(sql)) {
                return { rows: [{ id: NOV_ID }] };
            }
            if (/INSERT INTO audit_log/.test(sql)) {
                return { rows: [] };
            }
            if (/UPDATE novedades SET/.test(sql) && /nomina_procesado_en/.test(sql)) {
                const ids = params[0] || [];
                const updated = [];
                for (const id of ids) {
                    if (marked.has(id)) continue;
                    marked.add(id);
                    updated.push({ id });
                }
                return { rows: updated, rowCount: updated.length };
            }
            if (/SELECT nov\.id/.test(sql)) {
                return { rows: [{ id: NOV_ID, tipo_novedad: 'Incapacidad' }] };
            }
            return { rows: [] };
        },
        connect: async () => {
            const client = {
                query: async (sql, params) => {
                    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
                    return buildMockPool().query(sql, params);
                },
                release() {}
            };
            client.query = async (sql, params) => {
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
                if (/UPDATE novedades SET/.test(sql)) {
                    const ids = params[0] || [];
                    const updated = [];
                    for (const id of ids) {
                        if (marked.has(id)) continue;
                        marked.add(id);
                        updated.push({ id });
                    }
                    return { rows: updated, rowCount: updated.length };
                }
                if (/INSERT INTO audit_log/.test(sql)) return { rows: [] };
                return { rows: [] };
            };
            return client;
        }
    };
}

function buildAppWithRole(role, poolExtras = {}) {
    const pool = { ...buildMockPool(), ...poolExtras };
    const app = express();
    app.use(express.json());
    const noAuth = (req, _res, next) => {
        req.user = { role, sub: NOV_ID, email: 'nomina@example.com' };
        req.scope = { canViewAllAreas: true, areas: [], role };
        next();
    };
    const scopedRows = [
        {
            id: NOV_ID,
            nombre: 'Test',
            cedula: '123',
            correo_solicitante: 'a@b.co',
            cliente: 'C',
            lider: 'L',
            gp_user_id: null,
            tipo_novedad: 'Incapacidad',
            area: 'Operaciones',
            fecha: null,
            hora_inicio: null,
            hora_fin: null,
            fecha_inicio: new Date('2025-01-02'),
            fecha_fin: new Date('2025-01-03'),
            cantidad_horas: 1,
            horas_diurnas: 0,
            horas_nocturnas: 0,
            horas_recargo_domingo: 0,
            horas_recargo_domingo_diurnas: 0,
            horas_recargo_domingo_nocturnas: 0,
            horas_recargo_nocturno: 0,
            tipo_hora_extra: null,
            monto_cop: null,
            soporte_ruta: null,
            estado: 'Aprobado',
            creado_en: new Date(),
            nomina_procesado_en: null,
            nomina_procesado_por_user_id: null,
            nomina_procesado_por_email: null,
            nomina_procesado_lote: null,
            he_domingo_observacion: null
        }
    ];
    registerRoutes({
        app,
        logger: { error() {} },
        authLimiter: limiter,
        forgotLimiter: limiter,
        submitLimiter: limiter,
        consultorFormPostLimiter: limiter,
        catalogLimiter: limiter,
        normalizeCedula: (v) => String(v || '').replace(/\D/g, ''),
        getColaboradorByCedula: async () => null,
        verificarToken: noAuth,
        isStrongPassword: () => true,
        COGNITO_ENABLED: false,
        COGNITO_APP_CLIENT_ID: 'x',
        buildCognitoSecretHash: () => '',
        cognitoPublicApi: async () => ({}),
        decodeJwtPayload: () => ({}),
        buildUserFromCognitoClaims: () => ({}),
        resolveEffectiveRole: () => role,
        issueAppTokenFromCognito: () => ({ token: 't', user: {}, expiresInSec: 300 }),
        allowPanel: () => (_req, _res, next) => next(),
        applyScope: (_req, _res, next) => next(),
        getScopedNovedades: async (_scope, options = {}) => {
            let rows = scopedRows;
            const np = String(options.nominaProcesado || '').toLowerCase();
            if (np === 'si') rows = rows.filter((r) => r.nomina_procesado_en != null);
            if (np === 'no') rows = rows.filter((r) => r.nomina_procesado_en == null);
            return rows;
        },
        buildScopedNovedadesWhere: async () => ({ empty: false, whereSql: '', params: [] }),
        listScopedDistinctClientes: async () => [],
        getHoraExtraAlerts: async () => ({}),
        listHoraExtraByCedulaForDomingoPolicy: async () => [],
        toClientNovedad,
        allowAnyPanel: () => (_req, _res, next) => next(),
        getClientesList: async () => [],
        normalizeCatalogValue: (v) => String(v || '').trim(),
        getLideresByCliente: async () => [],
        upload: { any: () => (_req, _res, next) => next() },
        getNovedadRuleByType: () => ({ key: 'incapacidad', requiredMinSupports: 0 }),
        path,
        allowedMimes: new Set(['application/pdf']),
        allowedExt: new Set(['.pdf']),
        s3Client: null,
        buildS3SupportKey: () => 'k',
        S3_BUCKET_NAME: 'bucket',
        sanitizeFileName: (v) => v,
        sanitizeSegment: (v) => v,
        fs,
        uploadDir: process.cwd(),
        inferAreaFromNovedad: () => 'Operaciones',
        parseDateOrNull: (v) => {
            const s = String(v || '').trim();
            if (!s) return null;
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        },
        parseTimeOrNull: (v) => {
            const s = String(v || '').trim();
            if (!s) return null;
            const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
            if (!m) return null;
            return `${m[1]}:${m[2]}:${m[3] || '00'}`;
        },
        pool,
        S3_SIGNED_URL_TTL_SEC: 60,
        PutObjectCommand: function PutObjectCommand() {},
        GetObjectCommand: function GetObjectCommand() {},
        getSignedUrl: async () => 'http://signed',
        normalizeEstado: (v) => {
            const x = String(v || '').trim();
            if (x === 'Aprobado' || x === 'Rechazado' || x === 'Pendiente') return x;
            return 'Pendiente';
        },
        canRoleApproveType: () => true,
        FRONTEND_URL: 'http://localhost:5175',
        POLICY: {
            nomina: { panels: ['gestion'], viewAllAreas: true },
            gp: { panels: ['gestion'], viewAllAreas: true },
            super_admin: { panels: ['gestion'], viewAllAreas: true }
        },
        xlsx: { read: () => ({}), utils: { sheet_to_json: () => [] } },
        emailNotificationsPublisher: {},
        resolveApproverEmailsForNovedad: async () => ({ emails: [] }),
        revokeAppSessionToken: () => {},
        requireEntraConsultor: () => (_req, _res, next) => next(),
        requireCatalogConsultorOrStaff: () => (_req, _res, next) => next(),
        findPendingNovedadDuplicate: async () => null
    });
    return { app, pool };
}

test('canMarkNominaProcesadoRole — gp no, nomina sí', () => {
    assert.equal(canMarkNominaProcesadoRole('gp'), false);
    assert.equal(canMarkNominaProcesadoRole('nomina'), true);
    assert.equal(canMarkNominaProcesadoRole('super_admin'), true);
    assert.equal(canMarkNominaProcesadoRole('cac'), true);
});

test('parseIdList deduplica UUIDs válidos', () => {
    const ids = parseIdList([NOV_ID, NOV_ID, 'bad', NOV_ID_2]);
    assert.deepEqual(ids, [NOV_ID, NOV_ID_2]);
});

test('toClientNovedad expone campos nominaProcesado', () => {
    const en = new Date('2026-05-24T12:00:00.000Z');
    const out = toClientNovedad({
        id: NOV_ID,
        nombre: 'N',
        cedula: '1',
        correo_solicitante: '',
        cliente: '',
        lider: '',
        gp_user_id: null,
        tipo_novedad: 'Incapacidad',
        area: 'Operaciones',
        fecha: null,
        hora_inicio: null,
        hora_fin: null,
        fecha_inicio: null,
        fecha_fin: null,
        cantidad_horas: 0,
        horas_diurnas: 0,
        horas_nocturnas: 0,
        horas_recargo_domingo: 0,
        horas_recargo_domingo_diurnas: 0,
        horas_recargo_domingo_nocturnas: 0,
        horas_recargo_nocturno: 0,
        tipo_hora_extra: null,
        monto_cop: null,
        soporte_ruta: null,
        estado: 'Aprobado',
        creado_en: en,
        nomina_procesado_en: en,
        nomina_procesado_por_email: 'nomina@example.com',
        nomina_procesado_lote: 'lote-1'
    });
    assert.equal(out.nominaProcesado, true);
    assert.equal(out.nominaProcesadoPorCorreo, 'nomina@example.com');
    assert.equal(out.nominaProcesadoLote, 'lote-1');
});

test('POST /api/novedades/nomina-procesar — gp → 403', async () => {
    const { app } = buildAppWithRole('gp');
    const res = await request(app)
        .post('/api/novedades/nomina-procesar')
        .send({ ids: [NOV_ID] });
    assert.equal(res.status, 403);
});

test('POST /api/novedades/nomina-procesar — nomina marca e idempotencia', async () => {
    const { app, pool } = buildAppWithRole('nomina');
    const first = await request(app)
        .post('/api/novedades/nomina-procesar')
        .send({ ids: [NOV_ID], lote: '2026-05-test' });
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);
    assert.equal(first.body.marked, 1);
    assert.ok(pool.marked.has(NOV_ID));

    const second = await request(app)
        .post('/api/novedades/nomina-procesar')
        .send({ ids: [NOV_ID] });
    assert.equal(second.status, 200);
    assert.equal(second.body.marked, 0);
});

test('GET /api/novedades?nominaProcesado=no devuelve pendientes', async () => {
    const { app } = buildAppWithRole('nomina');
    const res = await request(app).get('/api/novedades?nominaProcesado=no');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].nominaProcesado, false);
});

test('markNominaProcesado servicio — sin ids ni filtros → 400', async () => {
    const pool = buildMockPool();
    const result = await markNominaProcesado({
        pool,
        req: { user: { role: 'nomina', email: 'n@e.co' }, scope: { role: 'nomina' } },
        buildScopedNovedadesWhere: async () => ({ empty: false, whereSql: '', params: [] }),
        body: {}
    });
    assert.equal(result.status, 400);
});
