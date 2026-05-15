const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('node:path');
const fs = require('node:fs');
const { registerRoutes } = require('../src/registerRoutes');

function noAuth(req, _res, next) {
  req.user = { role: 'super_admin', sub: 'u-1', email: 'qa@example.com' };
  req.scope = { canViewAllAreas: true, areas: [] };
  next();
}

function limiter(_req, _res, next) { next(); }

function buildApp(overrides = {}) {
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
    getColaboradorByCedula: async () => null,
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
    getClientesList: async () => [' Cliente A ', ''],
    normalizeCatalogValue: (v) => String(v || '').trim(),
    getLideresByCliente: async () => ['Lider A'],
    upload: { any: () => (_req, _res, next) => next() },
    getNovedadRuleByType: (typeName = '') => {
      const t = String(typeName || '').toLowerCase();
      if (/votaci.n/.test(t) || /jurado/.test(t)) {
        return { key: 'compensatorio_votacion_jurado', displayName: 'Compensatorio por votación/jurado', requiredMinSupports: 1 };
      }
      return { key: 'incapacidad', displayName: 'Incapacidad', requiredMinSupports: 0 };
    },
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
    inferAreaFromNovedad: () => 'admin',
    parseDateOrNull: (v) => (v ? String(v) : null),
    parseTimeOrNull: (v) => (v ? String(v) : null),
    pool: { query: async () => ({ rows: [] }) },
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
    requireCatalogConsultorOrStaff: (_req, _res, next) => next(),
    ...overrides
  });
  return app;
}

test('GET /api/catalogos/clientes responde contrato mínimo', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/catalogos/clientes');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.items, ['Cliente A']);
});

test('GET /api/catalogos/lideres exige cliente', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/catalogos/lideres');
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('GET /api/novedades/duplicado-pendiente requiere tipo', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/novedades/duplicado-pendiente');
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('GET /api/novedades/duplicado-pendiente devuelve duplicado=true cuando el helper detecta una previa Pendiente', async () => {
  const app = buildApp({
    findPendingNovedadDuplicate: async () => ({ duplicado: true, id: 'nov-uuid-1' })
  });
  const res = await request(app)
    .get('/api/novedades/duplicado-pendiente')
    .query({ tipo: 'Incapacidad', fechaInicio: '2026-06-01', fechaFin: '2026-06-05' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.duplicado, true);
});

test('GET /api/novedades/duplicado-pendiente excluye Compensatorio por votación/jurado (fuera_de_alcance)', async () => {
  const helperCalls = [];
  const app = buildApp({
    findPendingNovedadDuplicate: async (args) => {
      helperCalls.push(args);
      return { duplicado: true, id: 'no-debe-llegar' };
    }
  });
  const res = await request(app)
    .get('/api/novedades/duplicado-pendiente')
    .query({ tipo: 'Compensatorio por votación/jurado', fechaInicio: '2026-05-26' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.duplicado, false);
  assert.equal(res.body.scope, 'fuera_de_alcance');
  assert.equal(helperCalls.length, 0, 'no debe consultar el helper para votación/jurado');
});

test('GET /api/novedades/duplicado-pendiente sin fechaInicio devuelve duplicado=false sin consultar helper', async () => {
  let consulto = false;
  const app = buildApp({
    findPendingNovedadDuplicate: async () => {
      consulto = true;
      return { duplicado: true, id: 'x' };
    }
  });
  const res = await request(app)
    .get('/api/novedades/duplicado-pendiente')
    .query({ tipo: 'Incapacidad' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.duplicado, false);
  assert.equal(consulto, false);
});
