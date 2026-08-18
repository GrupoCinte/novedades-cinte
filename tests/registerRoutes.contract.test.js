const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
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
    pdfLimiter: limiter,
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

test('GET /api/admin/actividades devuelve actividades filtradas con contrato de solo lectura', async () => {
  const calls = [];
  const app = buildApp({
    pool: {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return {
          rows: [{
            id: '11111111-1111-4111-8111-111111111111',
            cedula: '10101010',
            consultor_nombre: 'Ana',
            cliente: 'Cliente A',
            descripcion: 'Soporte',
            inicio: '2026-07-10T13:00:00.000Z',
            fin: '2026-07-10T14:00:00.000Z',
            origen: 'manual',
            estado: 'pendiente'
          }]
        };
      }
    }
  });
  const res = await request(app).get('/api/admin/actividades').query({ fechaDesde: '2026-07-01', cedula: '10101010' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.items[0].consultor_nombre, 'Ana');
  assert.match(calls[0].sql, /INNER JOIN colaboradores c/);
  assert.deepEqual(calls[0].params, ['2026-07-01', '10101010']);
});

test('GET /api/admin/actividades rechaza fechas inválidas', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/admin/actividades').query({ fechaDesde: '2026-07-31', fechaHasta: '2026-07-01' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
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

// ─── HU disponibilidad-monto-diligenciado-por-gp ─────────────────────────────
//
// El aprobador (GP/super_admin/CAC) DEBE diligenciar el monto en COP al transicionar
// una novedad de Disponibilidad a Aprobado/Rechazado. Sin monto > 0, el endpoint debe
// rechazar la transición con HTTP 400 y NO modificar la BD.

const VALID_NOVEDAD_UUID = '11111111-1111-4111-8111-111111111111';

function buildPoolForActualizarEstado({ tipoNovedad, captureUpdate = null }) {
  return {
    query: async (sql, params) => {
      const text = String(sql || '');
      if (text.includes('FROM novedades') && text.includes('WHERE id = $1::uuid') && text.includes('LIMIT 1')) {
        return {
          rows: [{
            id: VALID_NOVEDAD_UUID,
            area: 'admin',
            tipo_novedad: tipoNovedad,
            estado: 'Pendiente',
            nombre: 'Tester',
            correo_solicitante: 'tester@example.com',
            cliente: 'Cliente A',
            lider: 'Lider A',
            fecha_inicio: '2026-05-20',
            fecha_fin: '2026-05-25',
            cantidad_horas: 0,
            monto_cop: null
          }]
        };
      }
      if (text.includes('FROM users')) {
        return { rows: [{ id: 'user-uuid' }] };
      }
      if (text.startsWith('UPDATE novedades')) {
        if (typeof captureUpdate === 'function') captureUpdate(text, params);
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
}

test('POST /api/actualizar-estado: Disponibilidad sin montoCop → 400', async () => {
  let updated = false;
  const app = buildApp({
    pool: buildPoolForActualizarEstado({
      tipoNovedad: 'Disponibilidad',
      captureUpdate: () => { updated = true; }
    })
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({ id: VALID_NOVEDAD_UUID, nuevoEstado: 'Aprobado' });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(String(res.body.error || ''), /pesos/i);
  assert.equal(updated, false, 'no debe ejecutar UPDATE cuando falta el monto');
});

test('POST /api/actualizar-estado: Disponibilidad con montoCop ≤ 0 → 400', async () => {
  const app = buildApp({
    pool: buildPoolForActualizarEstado({ tipoNovedad: 'Disponibilidad' })
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({ id: VALID_NOVEDAD_UUID, nuevoEstado: 'Aprobado', montoCop: 0 });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('POST /api/actualizar-estado: Disponibilidad con montoCop > 0 → 200 y persiste el monto', async () => {
  let captured = null;
  const app = buildApp({
    pool: buildPoolForActualizarEstado({
      tipoNovedad: 'Disponibilidad',
      captureUpdate: (_text, params) => { captured = params; }
    })
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({ id: VALID_NOVEDAD_UUID, nuevoEstado: 'Aprobado', montoCop: 1500000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(captured, 'el UPDATE debe ejecutarse');
  // El UPDATE recibe en $7 (aplicaDiligenciamientoMonto) y $8 (nuevoMontoCopParaUpdate).
  assert.equal(captured[6], true, '$7 = aplicaDiligenciamientoMonto debe ser true');
  assert.equal(Number(captured[7]), 1500000, '$8 = monto en COP con dos decimales');
});

test('POST /api/actualizar-estado: tipo NO Disponibilidad sin montoCop → 200 (no exige monto)', async () => {
  let captured = null;
  const app = buildApp({
    pool: buildPoolForActualizarEstado({
      tipoNovedad: 'Incapacidad',
      captureUpdate: (_text, params) => { captured = params; }
    })
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({ id: VALID_NOVEDAD_UUID, nuevoEstado: 'Aprobado' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(captured[6], false, '$7 = aplicaDiligenciamientoMonto debe ser false para tipos no-Disponibilidad');
  assert.equal(captured[7], null, '$8 = monto null cuando no aplica diligenciamiento');
});

test('POST /api/actualizar-estado: Disponibilidad RECHAZADA también requiere montoCop > 0', async () => {
  const app = buildApp({
    pool: buildPoolForActualizarEstado({ tipoNovedad: 'Disponibilidad' })
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({
      id: VALID_NOVEDAD_UUID,
      nuevoEstado: 'Rechazado',
      observacionesRechazo: 'Falta soporte de disponibilidad.'
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(String(res.body.error || ''), /pesos/i);
});

test('POST /api/actualizar-estado: Rechazado sin observacionesRechazo → 400', async () => {
  let updated = false;
  const app = buildApp({
    pool: buildPoolForActualizarEstado({
      tipoNovedad: 'Incapacidad',
      captureUpdate: () => { updated = true; }
    })
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({ id: VALID_NOVEDAD_UUID, nuevoEstado: 'Rechazado' });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(String(res.body.error || ''), /observaci[oó]n de rechazo/i);
  assert.equal(updated, false);
});

test('POST /api/actualizar-estado: Rechazado con observacionesRechazo → 200 y persiste', async () => {
  let captured = null;
  const motivo = 'Documento ilegible; adjunte incapacidad legible.';
  const app = buildApp({
    pool: buildPoolForActualizarEstado({
      tipoNovedad: 'Incapacidad',
      captureUpdate: (_text, params) => { captured = params; }
    }),
    emailNotificationsPublisher: {
      publishFormStatusChanged: async (payload) => {
        assert.equal(payload.rejectionFeedback, motivo);
        return { accepted: true, skipped: false };
      }
    }
  });
  const res = await request(app)
    .post('/api/actualizar-estado')
    .send({
      id: VALID_NOVEDAD_UUID,
      nuevoEstado: 'Rechazado',
      observacionesRechazo: motivo
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(captured);
  assert.equal(captured[8], motivo, '$9 = observaciones de rechazo');
});

// ─── AUT-384: división mensual incapacidades/licencias al radicar ─────────────

function buildColaboradorEnviarNovedad() {
  return {
    nombre: 'Consultor Test',
    cliente: 'Cliente A',
    lider_catalogo: 'Lider A',
    correo_cinte: 'consultor@example.com',
    gp_user_id: null
  };
}

function buildPoolForEnviarNovedad({ onDupCheck } = {}) {
  const inserts = [];
  const queryImpl = async (sql, params) => {
    const text = String(sql || '').trim();
    if (text.includes('FROM novedades') && text.includes('Pendiente')) {
      const dup = onDupCheck ? onDupCheck(params, inserts.length) : false;
      return dup ? { rows: [{ id: 'dup-existing' }] } : { rows: [] };
    }
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [] };
    }
    if (text.includes('INSERT INTO novedades')) {
      const id = `nov-split-${inserts.length + 1}`;
      inserts.push({ params, id });
      return { rows: [{ id }] };
    }
    return { rows: [] };
  };
  return {
    inserts,
    query: queryImpl,
    connect: async () => ({
      query: queryImpl,
      release: () => {}
    })
  };
}

function buildAppEnviarNovedad(poolOverrides = {}) {
  const pool = buildPoolForEnviarNovedad(poolOverrides);
  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 10 }
  });
  const app = buildApp({
    pool,
    inferAreaFromNovedad: () => 'Capital Humano',
    getColaboradorByCedula: async () => buildColaboradorEnviarNovedad(),
    getNovedadRuleByType: () => ({
      key: 'incapacidad',
      displayName: 'Incapacidad',
      requiredMinSupports: 0
    }),
    upload: { any: () => memoryUpload.any() }
  });
  return { app, pool };
}

test('POST /api/enviar-novedad: incapacidad multi-mes → splitCount e ids', async () => {
  const { app, pool } = buildAppEnviarNovedad();
  const res = await request(app)
    .post('/api/enviar-novedad')
    .field('tipoNovedad', 'Incapacidad')
    .field('cedula', '1015123456')
    .field('aceptaPoliticaDatos', 'true')
    .field('fechaInicio', '2026-01-15')
    .field('fechaFin', '2026-04-10')
    .field('cantidadHoras', '86')
    .field('cliente', 'Cliente A')
    .field('lider', 'Lider A')
    .field('correoSolicitante', 'consultor@example.com');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.splitCount, 4);
  assert.equal(Array.isArray(res.body.ids), true);
  assert.equal(res.body.ids.length, 4);
  assert.equal(res.body.id, res.body.ids[0]);
  assert.equal(pool.inserts.length, 4);

  const seg1Params = pool.inserts[0].params;
  assert.equal(String(seg1Params[11]), '2026-01-15');
  assert.equal(String(seg1Params[12]), '2026-01-31');
  const seg4Params = pool.inserts[3].params;
  assert.equal(String(seg4Params[11]), '2026-04-01');
  assert.equal(String(seg4Params[12]), '2026-04-10');
  assert.match(String(seg4Params[26] || ''), /Segmento 4\/4/);
});

test('POST /api/enviar-novedad: incapacidad mismo mes → un solo registro', async () => {
  const { app, pool } = buildAppEnviarNovedad();
  const res = await request(app)
    .post('/api/enviar-novedad')
    .field('tipoNovedad', 'Incapacidad')
    .field('cedula', '1015123456')
    .field('aceptaPoliticaDatos', 'true')
    .field('fechaInicio', '2026-01-05')
    .field('fechaFin', '2026-01-20')
    .field('cantidadHoras', '16')
    .field('cliente', 'Cliente A')
    .field('lider', 'Lider A')
    .field('correoSolicitante', 'consultor@example.com');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.splitCount, undefined);
  assert.equal(pool.inserts.length, 1);
});

test('POST /api/enviar-novedad: duplicado en segmento → 409 sin inserts', async () => {
  let dupChecks = 0;
  const { app, pool } = buildAppEnviarNovedad({
    onDupCheck: () => {
      dupChecks += 1;
      return dupChecks === 2;
    }
  });
  const res = await request(app)
    .post('/api/enviar-novedad')
    .field('tipoNovedad', 'Incapacidad')
    .field('cedula', '1015123456')
    .field('aceptaPoliticaDatos', 'true')
    .field('fechaInicio', '2026-01-15')
    .field('fechaFin', '2026-03-10')
    .field('cantidadHoras', '55')
    .field('cliente', 'Cliente A')
    .field('lider', 'Lider A')
    .field('correoSolicitante', 'consultor@example.com');

  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
  assert.equal(pool.inserts.length, 0);
});
