'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildActionUrl,
    attachActionUrlsToEvent,
    resolveEmailActionTokenTtlMs,
    formatEmailActionTokenTtlLabel,
    hashToken,
    assertTokenRowValid,
    executeEmailActionTransactional,
    consumeEmailActionTokenLocked
} = require('../src/conciliaciones/conciliacionEmailAccion');
const { sanitizeAuditPath, sanitizeAuditUrl } = require('../src/runtimeAudit');

const ENV_KEYS = ['CONCILIACION_EMAIL_TOKEN_TTL_HOURS', 'CONCILIACION_EMAIL_TOKEN_TTL_DAYS'];

test('buildActionUrl genera landing con token y acción view', () => {
    const url = buildActionUrl('https://novedades.example.com', 'abc123', 'view');
    assert.match(url, /^https:\/\/novedades\.example\.com\/conciliaciones\/email-accion\?token=abc123&accion=view$/);
});

test('attachActionUrlsToEvent añade viewUrl y plazo', () => {
    const event = {
        eventType: 'conciliacion_correo_lider',
        eventId: 'evt-1',
        asunto: 'Test'
    };
    const tokens = {
        view: 'tok-view',
        plazoLabel: '3 días',
        ttlHours: 72,
        expiraAt: new Date('2026-07-20T00:00:00.000Z')
    };
    const out = attachActionUrlsToEvent(event, tokens, 'http://localhost:5175');
    assert.ok(out.actions.viewUrl.includes('tok-view'));
    assert.ok(out.actions.viewUrl.includes('accion=view'));
    assert.equal(out.plazoLabel, '3 días');
    assert.equal(out.ttlHours, 72);
    assert.equal(out.asunto, 'Test');
});

test('formatEmailActionTokenTtlLabel: 72h → 3 días', () => {
    assert.equal(formatEmailActionTokenTtlLabel(72 * 60 * 60 * 1000), '3 días');
    assert.equal(formatEmailActionTokenTtlLabel(48 * 60 * 60 * 1000), '2 días');
    assert.equal(formatEmailActionTokenTtlLabel(5 * 60 * 60 * 1000), '5 horas');
});

test('resolveEmailActionTokenTtlMs: default 72 h', () => {
    const prev = {};
    for (const k of ENV_KEYS) {
        prev[k] = process.env[k];
        delete process.env[k];
    }
    try {
        assert.equal(resolveEmailActionTokenTtlMs(), 72 * 60 * 60 * 1000);
    } finally {
        for (const k of ENV_KEYS) {
            if (prev[k] != null) process.env[k] = prev[k];
            else delete process.env[k];
        }
    }
});

test('resolveEmailActionTokenTtlMs: CONCILIACION_EMAIL_TOKEN_TTL_HOURS tiene prioridad', () => {
    const prev = {};
    for (const k of ENV_KEYS) {
        prev[k] = process.env[k];
    }
    process.env.CONCILIACION_EMAIL_TOKEN_TTL_HOURS = '48';
    process.env.CONCILIACION_EMAIL_TOKEN_TTL_DAYS = '14';
    try {
        assert.equal(resolveEmailActionTokenTtlMs(), 48 * 60 * 60 * 1000);
    } finally {
        for (const k of ENV_KEYS) {
            if (prev[k] != null) process.env[k] = prev[k];
            else delete process.env[k];
        }
    }
});

test('assertTokenRowValid: enlace ya usado → 410', () => {
    assert.throws(
        () => assertTokenRowValid({ usado_at: new Date(), accion: 'view' }, 'view'),
        (e) => e.status === 410
    );
});

test('assertTokenRowValid: acción incorrecta → 400', () => {
    assert.throws(
        () =>
            assertTokenRowValid(
                { accion: 'view', usado_at: null, expira_at: new Date(Date.now() + 3600000) },
                'approve'
            ),
        (e) => e.status === 400
    );
});

test('sanitizeAuditPath enmascara token hex en path legacy', () => {
    const hex = 'a'.repeat(64);
    const path = `/api/conciliaciones/email-accion/${hex}/approve`;
    assert.equal(sanitizeAuditPath(path), '/api/conciliaciones/email-accion/:token/approve');
});

test('sanitizeAuditUrl enmascara token en query', () => {
    const url = '/api/conciliaciones/email-accion/context?token=secret123&accion=view';
    assert.match(sanitizeAuditUrl(url), /token=\[redacted\]/);
    assert.doesNotMatch(sanitizeAuditUrl(url), /secret123/);
});

test('executeEmailActionTransactional: segundo consumo falla con 409', async () => {
    const rawToken = 'bb'.repeat(32);
    const tokenHash = hashToken(rawToken);
    let txnCount = 0;
    let tokenConsumed = false;

    const baseRow = {
        id: '1',
        servicio_id: 'svc-1',
        anio: 2026,
        mes: 6,
        accion: 'approve',
        recipient_email: 'lider@test.com',
        usado_at: null,
        expira_at: new Date(Date.now() + 86400000),
        columnas_json: null
    };

    const client = {
        release: () => {},
        query: async (sql, params) => {
            const s = String(sql);
            if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
            if (s.includes('FOR UPDATE') && s.includes('conciliaciones_email_acciones')) {
                return { rows: [{ ...baseRow }] };
            }
            if (s.includes('SELECT estado_servicio FROM conciliaciones_servicio_cierre')) {
                return { rows: [{ estado_servicio: 'ENVIADA' }] };
            }
            if (s.includes("estado_servicio = 'CONCILIADA'")) {
                return { rows: [{ servicio_id: 'svc-1', estado_servicio: 'CONCILIADA' }] };
            }
            if (s.includes('SET usado_at = NOW()')) {
                assert.equal(params[0], tokenHash);
                txnCount += 1;
                if (tokenConsumed) return { rowCount: 0 };
                tokenConsumed = true;
                return { rowCount: 1 };
            }
            return { rows: [] };
        }
    };

    const pool = {
        connect: async () => client
    };

    const scope = { role: 'super_admin' };
    const out = await executeEmailActionTransactional(pool, scope, rawToken, { accion: 'approve' });
    assert.equal(out.estado, 'CONCILIADA');
    assert.equal(txnCount, 1);

    await assert.rejects(
        () => executeEmailActionTransactional(pool, scope, rawToken, { accion: 'approve' }),
        (e) => e.status === 409
    );
});

test('consumeEmailActionTokenLocked: rowCount 0 si ya consumido', async () => {
    const client = {
        query: async () => ({ rowCount: 0 })
    };
    const n = await consumeEmailActionTokenLocked(client, 'abc', null);
    assert.equal(n, 0);
});
