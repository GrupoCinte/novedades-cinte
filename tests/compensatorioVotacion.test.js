const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const multer = require('multer');
const {
    registerRoutes,
    findVotacionFranjaSolapada,
    FECHAS_VOTACION_HABILITADAS,
    DIAS_DISFRUTE_JURADO,
    DIAS_DISFRUTE_VOTO
} = require('../src/registerRoutes');

// ─── Constantes de jornadas electorales ──────────────────────────────────────

test('jornadas electorales habilitadas: solo 31-may-2026 y 21-jun-2026', () => {
    assert.equal(FECHAS_VOTACION_HABILITADAS.has('2026-05-31'), true);
    assert.equal(FECHAS_VOTACION_HABILITADAS.has('2026-06-21'), true);
    assert.equal(FECHAS_VOTACION_HABILITADAS.size, 2);
    assert.equal(FECHAS_VOTACION_HABILITADAS.has('2026-06-22'), false);
});

test('ventanas de disfrute por modalidad: 45 jurado, 30 votación', () => {
    assert.equal(DIAS_DISFRUTE_JURADO, 45);
    assert.equal(DIAS_DISFRUTE_VOTO, 30);
});

// ─── Lógica pura de solape de franjas (votación / medio día) ──────────────────

test('findVotacionFranjaSolapada: franjas sin cruce (08:00–12:00 vs 13:00–16:00) → null', () => {
    const r = findVotacionFranjaSolapada('13:00:00', '16:00:00', [
        { hora_inicio: '08:00:00', hora_fin: '12:00:00' }
    ]);
    assert.equal(r, null);
});

test('findVotacionFranjaSolapada: bordes que se tocan (12:00 fin vs 12:00 inicio) → null', () => {
    const r = findVotacionFranjaSolapada('12:00:00', '15:00:00', [
        { hora_inicio: '08:00:00', hora_fin: '12:00:00' }
    ]);
    assert.equal(r, null);
});

test('findVotacionFranjaSolapada: cruce parcial (10:00–13:00 vs 08:00–12:00) → detecta', () => {
    const r = findVotacionFranjaSolapada('10:00:00', '13:00:00', [
        { hora_inicio: '08:00:00', hora_fin: '12:00:00' }
    ]);
    assert.ok(r);
    assert.equal(r.hora_inicio, '08:00:00');
});

test('findVotacionFranjaSolapada: franja contenida → detecta', () => {
    const r = findVotacionFranjaSolapada('09:00:00', '10:00:00', [
        { hora_inicio: '08:00:00', hora_fin: '12:00:00' }
    ]);
    assert.ok(r);
});

test('findVotacionFranjaSolapada: ignora filas con horas nulas', () => {
    const r = findVotacionFranjaSolapada('09:00:00', '10:00:00', [
        { hora_inicio: null, hora_fin: null }
    ]);
    assert.equal(r, null);
});

// ─── Integración: rechazo de fecha de votación no habilitada (independiente del reloj) ──

function noAuth(req, _res, next) {
    req.user = { role: 'super_admin', sub: 'u-1', email: 'qa@example.com' };
    req.scope = { canViewAllAreas: true, areas: [] };
    next();
}
function limiter(_req, _res, next) { next(); }

function buildVotacionApp() {
    const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 10 } });
    const pool = { query: async () => ({ rows: [] }), connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) };
    const app = express();
    app.use(express.json());
    registerRoutes({
        app,
        logger: { error() {} },
        authLimiter: limiter,
        forgotLimiter: limiter,
        submitLimiter: limiter,
        consultorFormPostLimiter: limiter,
        catalogLimiter: limiter,
        normalizeCedula: (v) => String(v || '').replace(/\D/g, ''),
        getColaboradorByCedula: async () => ({
            nombre: 'Consultor Test',
            cliente: 'Cliente A',
            lider_catalogo: 'Lider A',
            correo_cinte: 'consultor@example.com',
            gp_user_id: null
        }),
        findPendingNovedadDuplicate: async () => ({ duplicado: false, id: null }),
        verificarToken: noAuth,
        isStrongPassword: () => true,
        COGNITO_ENABLED: false,
        COGNITO_APP_CLIENT_ID: 'x',
        buildCognitoSecretHash: () => '',
        cognitoPublicApi: async () => ({}),
        decodeJwtPayload: () => ({}),
        buildUserFromCognitoClaims: () => ({}),
        resolveEffectiveRole: () => 'super_admin',
        issueAppTokenFromCognito: () => ({ token: 't', user: {}, expiresInSec: 300 }),
        allowPanel: () => (_req, _res, next) => next(),
        applyScope: (_req, _res, next) => next(),
        getScopedNovedades: async () => [],
        listScopedDistinctClientes: async () => [],
        getHoraExtraAlerts: async () => ({}),
        toClientNovedad: (v) => v,
        allowAnyPanel: () => (_req, _res, next) => next(),
        getClientesList: async () => ['Cliente A'],
        normalizeCatalogValue: (v) => String(v || '').trim(),
        getLideresByCliente: async () => ['Lider A'],
        upload: { any: () => memoryUpload.any() },
        getNovedadRuleByType: () => ({
            key: 'compensatorio_votacion_jurado',
            displayName: 'Compensatorio por votación/jurado',
            requiredMinSupports: 1
        }),
        path,
        allowedMimes: new Set(['application/pdf']),
        allowedExt: new Set(['.pdf']),
        s3Client: null,
        buildS3SupportKey: () => 'k',
        S3_BUCKET_NAME: 'bucket',
        sanitizeFileName: (v) => v,
        sanitizeSegment: (v) => v,
        fs,
        uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'votacion-test-')),
        inferAreaFromNovedad: () => 'Capital Humano',
        parseDateOrNull: (v) => (v ? String(v) : null),
        parseTimeOrNull: (v) => (v ? String(v) : null),
        pool,
        S3_SIGNED_URL_TTL_SEC: 60,
        PutObjectCommand: function PutObjectCommand() {},
        GetObjectCommand: function GetObjectCommand() {},
        getSignedUrl: async () => 'http://signed',
        normalizeEstado: (v) => v,
        canRoleApproveType: () => true,
        FRONTEND_URL: 'http://localhost:5175',
        POLICY: { super_admin: { panels: ['admin', 'dashboard', 'calendar', 'gestion'], viewAllAreas: true } },
        xlsx: { read: () => ({}), utils: { sheet_to_json: () => [] } },
        emailNotificationsPublisher: {},
        resolveApproverEmailsForNovedad: async () => ({ emails: [] }),
        revokeAppSessionToken: () => {},
        requireEntraConsultor: (req, _res, next) => {
            req.user = req.user || {};
            req.user.cedula = req.user.cedula || '1015123456';
            req.user.authProvider = 'entra_consultor';
            next();
        },
        requireCatalogConsultorOrStaff: (_req, _res, next) => next()
    });
    return app;
}

test('POST /api/enviar-novedad: votación con fecha de jornada NO habilitada → 422', async () => {
    const app = buildVotacionApp();
    const res = await request(app)
        .post('/api/enviar-novedad')
        .field('tipoNovedad', 'Compensatorio por votación/jurado')
        .field('cedula', '1015123456')
        .field('aceptaPoliticaDatos', 'true')
        .field('modalidad', 'solo_jurado')
        .field('fechaVotacion', '2026-03-10')
        .field('fechaDisfrute', '2026-03-15')
        .field('cliente', 'Cliente A')
        .field('lider', 'Lider A')
        .field('correoSolicitante', 'consultor@example.com')
        .attach('soporte', Buffer.from('%PDF-1.4 test'), { filename: 'cert.pdf', contentType: 'application/pdf' });

    assert.equal(res.status, 422);
    assert.equal(res.body.ok, false);
    assert.match(String(res.body.error || ''), /no est[áa] habilitada/i);
});
