const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('node:path');
const fs = require('node:fs');
const { registerRoutes } = require('../src/registerRoutes');

function limiter(_req, _res, next) {
    next();
}

function buildAppWithRole(role) {
    const app = express();
    app.use(express.json());
    const noAuth = (req, _res, next) => {
        req.user = { role, sub: '550e8400-e29b-41d4-a716-446655440000', email: 'qa@example.com' };
        req.scope = { canViewAllAreas: true, areas: [] };
        next();
    };
    const pool = {
        query: async (sql, params) => {
            if (/SELECT \* FROM novedades WHERE id/.test(sql)) {
                return {
                    rows: [
                        {
                            id: '550e8400-e29b-41d4-a716-446655440000',
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
                            tipo_hora_extra: null,
                            monto_cop: null,
                            soporte_ruta: null,
                            estado: 'Pendiente',
                            creado_en: new Date(),
                            he_domingo_observacion: null
                        }
                    ]
                };
            }
            if (/INSERT INTO audit_log/.test(sql)) {
                return { rows: [] };
            }
            if (/DELETE FROM novedades/.test(sql)) {
                return { rowCount: 1, rows: [] };
            }
            if (/UPDATE novedades SET/.test(sql)) {
                return { rowCount: 1, rows: [] };
            }
            if (/SELECT id FROM users/.test(sql)) {
                return { rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }] };
            }
            return { rows: [] };
        }
    };
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
        getScopedNovedades: async () => [],
        listScopedDistinctClientes: async () => [],
        getHoraExtraAlerts: async () => ({}),
        listHoraExtraByCedulaForDomingoPolicy: async () => [],
        toClientNovedad: (v) => v,
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
        POLICY: { super_admin: { panels: ['gestion'], viewAllAreas: true } },
        xlsx: { read: () => ({}), utils: { sheet_to_json: () => [] } },
        emailNotificationsPublisher: {},
        resolveApproverEmailsForNovedad: async () => ({ emails: [] }),
        revokeAppSessionToken: () => {},
        requireEntraConsultor: () => (_req, _res, next) => next(),
        requireCatalogConsultorOrStaff: () => (_req, _res, next) => next()
    });
    return app;
}

test('DELETE /api/novedades/:id — no super_admin → 403', async () => {
    const app = buildAppWithRole('admin_ch');
    const res = await request(app)
        .delete('/api/novedades/550e8400-e29b-41d4-a716-446655440000')
        .send({ motivo: 'Limpieza' });
    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
});

test('DELETE /api/novedades/:id — motivo vacío → 400', async () => {
    const app = buildAppWithRole('super_admin');
    const res = await request(app)
        .delete('/api/novedades/550e8400-e29b-41d4-a716-446655440000')
        .send({ motivo: '   ' });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error || ''), /motivo/i);
});

test('DELETE /api/novedades/:id — super_admin con motivo → 200', async () => {
    const app = buildAppWithRole('super_admin');
    const res = await request(app)
        .delete('/api/novedades/550e8400-e29b-41d4-a716-446655440000')
        .send({ motivo: 'Duplicado en sistema' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
});

test('PATCH /api/novedades/:id — no super_admin → 403', async () => {
    const app = buildAppWithRole('gp');
    const res = await request(app)
        .patch('/api/novedades/550e8400-e29b-41d4-a716-446655440000')
        .send({ nombre: 'Otro' });
    assert.equal(res.status, 403);
});

test('PATCH /api/novedades/:id — super_admin actualiza nombre → 200', async () => {
    const app = buildAppWithRole('super_admin');
    const res = await request(app)
        .patch('/api/novedades/550e8400-e29b-41d4-a716-446655440000')
        .send({ nombre: 'Nombre actualizado' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
});
