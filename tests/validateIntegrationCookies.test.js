const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIntegrationCookies } = require('../src/sourcing/services/validateIntegrationCookies');

function validElempleoCookies() {
    return [
        { name: 'ASP.NET_SessionId', value: 'sess', domain: '.elempleo.com', path: '/', httpOnly: true },
        { name: 'connectId', value: 'conn', domain: '.elempleo.com', path: '/' },
        { name: '.ASPXAUTH', value: 'auth', domain: '.elempleo.com', path: '/', httpOnly: true }
    ];
}

test('validateIntegrationCookies rechaza solo analytics El Empleo', () => {
    const res = validateIntegrationCookies('elempleo', [
        { name: '_scor_uid', value: '1', domain: '.elempleo.com', path: '/' },
        { name: 'permutive-id', value: '2', domain: '.elempleo.com', path: '/' },
        { name: 'connectId', value: '3', domain: '.elempleo.com', path: '/' }
    ]);
    assert.equal(res.ok, false);
    assert.match(res.error, /publicidad|incompleta/i);
});

test('validateIntegrationCookies acepta ASP.NET_SessionId con HttpOnly (rollback pre-ASPXAUTH)', () => {
    const res = validateIntegrationCookies('elempleo', [
        { name: 'ASP.NET_SessionId', value: 'sess', domain: '.elempleo.com', path: '/', httpOnly: true },
        { name: '__RequestVerificationToken_L2Nv0', value: 'tok', domain: '.elempleo.com', path: '/', httpOnly: true },
        { name: 'connectId', value: '3', domain: '.elempleo.com', path: '/' }
    ]);
    assert.equal(res.ok, true);
});

test('validateIntegrationCookies acepta sesión empresarial El Empleo', () => {
    const res = validateIntegrationCookies('elempleo', validElempleoCookies());
    assert.equal(res.ok, true);
    assert.equal(res.cookies.length, 3);
});

test('validateIntegrationCookies exige li_at en LinkedIn', () => {
    const bad = validateIntegrationCookies('linkedin', [
        { name: 'bcookie', value: 'x', domain: '.linkedin.com', path: '/' }
    ]);
    assert.equal(bad.ok, false);
    const ok = validateIntegrationCookies('linkedin', [
        { name: 'li_at', value: 'token', domain: '.linkedin.com', path: '/', httpOnly: true },
        { name: 'bcookie', value: 'x', domain: '.linkedin.com', path: '/' }
    ]);
    assert.equal(ok.ok, true);
});
