const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createAuthHelpers } = require('../src/auth');

function buildHelpers() {
  return createAuthHelpers({
    jwt,
    SECRET_KEY: 'a'.repeat(64),
    COGNITO_ENABLED: false,
    COGNITO_REGION: '',
    COGNITO_APP_CLIENT_ID: 'client-id',
    COGNITO_APP_CLIENT_SECRET: '',
    cognitoIdVerifier: null,
    cognitoAccessVerifier: null,
    POLICY: {
      super_admin: { panels: ['admin', 'dashboard', 'gestion'], viewAllAreas: true },
      gp: { panels: ['dashboard'], viewAllAreas: false },
    },
    normalizeRoleOrNull: (v) => {
      const x = String(v || '').trim();
      return x || null;
    },
    resolveRoleFromGroups: () => '',
    getAreaFromRole: (role) => (role === 'gp' ? 'gp' : 'admin'),
  });
}

test('resolveEffectiveRole permite cambio para super_admin', () => {
  const h = buildHelpers();
  assert.equal(h.resolveEffectiveRole('super_admin', 'gp'), 'gp');
});

test('resolveEffectiveRole rechaza suplantación de rol', () => {
  const h = buildHelpers();
  assert.throws(() => h.resolveEffectiveRole('gp', 'super_admin'), /No autorizado/);
});

test('revokeAppSessionToken invalida token con jti', () => {
  const h = buildHelpers();
  const token = jwt.sign(
    { sub: '1', role: 'gp', authProvider: 'cognito_app', jti: 'jti-1' },
    'a'.repeat(64),
    { expiresIn: '1h' }
  );
  h.revokeAppSessionToken(token);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  let calledNext = false;
  return h.verificarToken(req, res, () => { calledNext = true; }).then(() => {
    assert.equal(calledNext, false);
    assert.equal(res.statusCode, 403);
  });
});
