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

function buildApp() {
  const app = express();
  app.use(express.json());
  registerRoutes({
    app,
    logger: { error() {} },
    authLimiter: limiter,
    forgotLimiter: limiter,
    submitLimiter: limiter,
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
    resolveEffectiveRole: () => 'super_admin',
    issueAppTokenFromCognito: () => ({ token: 't', user: {}, expiresInSec: 300 }),
    allowPanel: () => (_req, _res, next) => next(),
    applyScope: (_req, _res, next) => next(),
    getScopedNovedades: async () => [],
    getHoraExtraAlerts: async () => ({}),
    toClientNovedad: (v) => v,
    allowAnyPanel: () => (_req, _res, next) => next(),
    getClientesList: async () => [' Cliente A ', ''],
    normalizeCatalogValue: (v) => String(v || '').trim(),
    getLideresByCliente: async () => ['Lider A'],
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
    inferAreaFromNovedad: () => 'admin',
    parseDateOrNull: () => null,
    parseTimeOrNull: () => null,
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
    revokeAppSessionToken: () => {}
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
