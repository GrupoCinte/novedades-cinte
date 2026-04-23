const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * Réplica mínima de buildSafeLoginClaimsForClient (registerRoutes.js) para garantizar JSON estable.
 */
function buildSafeLoginClaimsForClient(claims, appRole, baseRole) {
    const c = claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : {};
    const groups = c['cognito:groups'];
    return {
        sub: c.sub != null ? String(c.sub) : null,
        email: c.email != null ? String(c.email) : null,
        name: c.name != null ? String(c.name) : null,
        'cognito:username': c['cognito:username'] != null ? String(c['cognito:username']) : null,
        'cognito:groups': Array.isArray(groups) ? groups.map((g) => String(g)) : null,
        aud: c.aud != null ? (Array.isArray(c.aud) ? c.aud.map(String) : String(c.aud)) : null,
        iss: c.iss != null ? String(c.iss) : null,
        token_use: c.token_use != null ? String(c.token_use) : null,
        auth_time: typeof c.auth_time === 'number' ? c.auth_time : null,
        iat: typeof c.iat === 'number' ? c.iat : null,
        exp: typeof c.exp === 'number' ? c.exp : null,
        role: appRole,
        baseRole
    };
}

describe('Login claims serializables', () => {
    it('serializa respuesta típida Cognito + rol app', () => {
        const claims = {
            sub: 'abc-123',
            email: 'u@x.com',
            name: 'User',
            'cognito:username': 'u@x.com',
            'cognito:groups': ['super_admin'],
            aud: 'clientid',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXX',
            token_use: 'id',
            auth_time: 1,
            iat: 2,
            exp: 3
        };
        const safe = buildSafeLoginClaimsForClient(claims, 'super_admin', 'super_admin');
        assert.doesNotThrow(() => JSON.stringify(safe));
        assert.equal(safe.role, 'super_admin');
        assert.deepEqual(safe['cognito:groups'], ['super_admin']);
    });

    it('aud puede ser array (algunos pools)', () => {
        const safe = buildSafeLoginClaimsForClient({ sub: 'x', aud: ['a', 'b'] }, 'cac', 'cac');
        assert.deepEqual(safe.aud, ['a', 'b']);
        assert.doesNotThrow(() => JSON.stringify(safe));
    });
});
