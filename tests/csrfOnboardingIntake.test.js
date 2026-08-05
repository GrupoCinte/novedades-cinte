'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shouldSkipCsrfDoubleSubmit } = require('../src/csrfDoubleSubmit');

function fakeReq(overrides = {}) {
    const headers = { ...(overrides.headers || {}) };
    return {
        method: overrides.method || 'POST',
        path: overrides.path || '/',
        get(name) {
            const key = String(name || '').toLowerCase();
            for (const [k, v] of Object.entries(headers)) {
                if (String(k).toLowerCase() === key) return v;
            }
            return undefined;
        }
    };
}

describe('shouldSkipCsrfDoubleSubmit', () => {
    it('exime intakes onboarding solo si traen x-onboarding-key', () => {
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({
                    path: '/api/onboarding/ficha-novedades/intake',
                    headers: { 'x-onboarding-key': 'secret' }
                })
            ),
            true
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({
                    path: '/api/onboarding/intake',
                    headers: { 'x-onboarding-key': 'secret' }
                })
            ),
            true
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(fakeReq({ path: '/api/onboarding/ficha-novedades/intake' })),
            false
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({
                    path: '/api/onboarding/intake',
                    headers: { 'x-onboarding-key': '   ' }
                })
            ),
            false
        );
    });

    it('sigue exigiendo CSRF en otras mutaciones /api sin Bearer', () => {
        assert.equal(
            shouldSkipCsrfDoubleSubmit(fakeReq({ path: '/api/novedades', method: 'POST' })),
            false
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({
                    path: '/api/onboarding/ficha-novedades',
                    headers: { 'x-onboarding-key': 'secret' }
                })
            ),
            false
        );
    });

    it('mantiene skips existentes (login, Bearer, atraccion, email-accion, GET)', () => {
        assert.equal(shouldSkipCsrfDoubleSubmit(fakeReq({ path: '/api/login' })), true);
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({
                    path: '/api/auth/forgot-password'
                })
            ),
            true
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({
                    path: '/api/novedades',
                    headers: { authorization: 'Bearer tok' }
                })
            ),
            true
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(fakeReq({ path: '/api/atraccion/internal/job-progress' })),
            true
        );
        assert.equal(
            shouldSkipCsrfDoubleSubmit(
                fakeReq({ path: '/api/conciliaciones/email-accion/aprobar' })
            ),
            true
        );
        assert.equal(shouldSkipCsrfDoubleSubmit(fakeReq({ method: 'GET', path: '/api/festivos' })), true);
        assert.equal(shouldSkipCsrfDoubleSubmit(fakeReq({ method: 'OPTIONS', path: '/api/novedades' })), true);
    });
});
