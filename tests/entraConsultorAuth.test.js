const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { buildAuthorizeUrl } = require('../src/auth/entraOidc');
const { createAuthHelpers } = require('../src/auth');
const { POLICY, normalizeRoleOrNull, resolveRoleFromGroups, getAreaFromRole } = require('../src/rbac');

const SECRET = 'c'.repeat(64);

test('buildAuthorizeUrl usa /{tenant}/oauth2/v2.0/authorize (no /v2.0/oauth2 duplicado)', () => {
    const u = buildAuthorizeUrl({
        tenantId: '11111111-1111-1111-1111-111111111111',
        clientId: 'cid',
        redirectUri: 'http://localhost:3005/cb',
        state: 'st'
    });
    assert.match(
        u,
        /^https:\/\/login\.microsoftonline\.com\/11111111-1111-1111-1111-111111111111\/oauth2\/v2\.0\/authorize\?/
    );
    assert.equal(u.includes('/v2.0/oauth2/v2.0/'), false);
});

function helpers() {
    return createAuthHelpers({
        jwt,
        SECRET_KEY: SECRET,
        COGNITO_ENABLED: false,
        COGNITO_REGION: '',
        COGNITO_APP_CLIENT_ID: 'x',
        COGNITO_APP_CLIENT_SECRET: '',
        cognitoIdVerifier: null,
        cognitoAccessVerifier: null,
        POLICY,
        normalizeRoleOrNull,
        resolveRoleFromGroups,
        getAreaFromRole
    });
}

test('issueAppTokenForEntraConsultor incluye cedula y authProvider', () => {
    const h = helpers();
    const { token, user } = h.issueAppTokenForEntraConsultor(
        { cedula: '1234567890', nombre: 'MARIA' },
        'entra-sub-oid',
        'maria@empresa.com'
    );
    assert.equal(user.role, 'consultor');
    assert.equal(user.cedula, '1234567890');
    const p = jwt.verify(token, SECRET);
    assert.equal(p.authProvider, 'entra_consultor');
    assert.equal(p.cedula, '1234567890');
});

test('verificarToken acepta JWT entra_consultor', async () => {
    const h = helpers();
    const { token } = h.issueAppTokenForEntraConsultor({ cedula: '999', nombre: 'X' }, 'oid', 'x@y.com');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    let next = false;
    await h.verificarToken(req, res, () => {
        next = true;
    });
    assert.equal(next, true);
    assert.equal(req.user.authProvider, 'entra_consultor');
    assert.equal(req.user.cedula, '999');
});

test('revokeAppSessionToken invalida entra_consultor', () => {
    const h = helpers();
    const { token } = h.issueAppTokenForEntraConsultor({ cedula: '1', nombre: 'A' }, 'o', 'a@b.co');
    h.revokeAppSessionToken(token);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    let next = false;
    return h.verificarToken(req, res, () => { next = true; }).then(() => {
        assert.equal(next, false);
        assert.equal(res.statusCode, 403);
    });
});

test('GET /api/auth/entra/start: cookie entraOidcState con SameSite=Lax (deps sameSite strict)', async () => {
    const express = require('express');
    const request = require('supertest');
    const { registerEntraRoutes } = require('../src/auth/registerEntraRoutes');
    const keys = ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI'];
    const prev = {};
    for (const k of keys) prev[k] = process.env[k];
    process.env.ENTRA_TENANT_ID = '11111111-1111-1111-1111-111111111111';
    process.env.ENTRA_CLIENT_ID = 'cid-entra-test';
    process.env.ENTRA_CLIENT_SECRET = 'secret-entra-test-at-least-some-chars';
    process.env.ENTRA_REDIRECT_URI = 'http://localhost:3005/api/auth/entra/callback';
    try {
        const app = express();
        registerEntraRoutes(app, {
            getColaboradorByEmail: async () => null,
            issueAppTokenForEntraConsultor: () => ({ token: 'x', expiresInSec: 60 }),
            revokeAppSessionToken: () => {},
            verificarToken: (req, res, next) => next(),
            FRONTEND_URL: 'http://localhost:5175',
            secureCookie: false,
            sameSite: 'strict'
        });
        const res = await request(app).get('/api/auth/entra/start').expect(302);
        const raw = res.headers['set-cookie'];
        assert.ok(Array.isArray(raw) && raw.length > 0, 'Set-Cookie presente');
        const stateLine = raw.find((c) => String(c).startsWith('entraOidcState='));
        assert.ok(stateLine, 'cookie entraOidcState');
        assert.match(stateLine, /SameSite=Lax/i);
        assert.doesNotMatch(stateLine, /SameSite=Strict/i);
    } finally {
        for (const k of keys) {
            if (prev[k] === undefined) delete process.env[k];
            else process.env[k] = prev[k];
        }
    }
});
