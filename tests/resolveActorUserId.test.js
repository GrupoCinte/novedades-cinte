const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveActorUserIdForSession } = require('../src/resolveActorUserId');

test('resolveActorUserIdForSession devuelve null sin datos', async () => {
    const id = await resolveActorUserIdForSession({ query: async () => ({ rows: [] }) }, {});
    assert.equal(id, null);
});

test('resolveActorUserIdForSession resuelve por email', async () => {
    const pool = {
        query: async (_sql, params) => {
            assert.equal(params[1], 'cac@cinte.test');
            return { rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }] };
        }
    };
    const id = await resolveActorUserIdForSession(pool, {
        sub: 'not-a-uuid-sub',
        email: 'cac@cinte.test'
    });
    assert.equal(id, '550e8400-e29b-41d4-a716-446655440000');
});

test('resolveActorUserIdForSession no usa sub UUID si no existe en users', async () => {
    const pool = {
        query: async () => ({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }] })
    };
    const id = await resolveActorUserIdForSession(pool, {
        sub: 'e4e89408-e001-70ec-9da2-e19163431819',
        email: 'lcorrea@grupocinte.com'
    });
    assert.equal(id, '11111111-1111-4111-8111-111111111111');
});
