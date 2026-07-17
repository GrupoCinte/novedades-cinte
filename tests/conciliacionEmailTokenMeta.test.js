'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    emptyEmailTokenMeta,
    getLatestViewTokenMeta
} = require('../src/conciliaciones/conciliacionEmailAccion');

test('emptyEmailTokenMeta shape', () => {
    const m = emptyEmailTokenMeta();
    assert.equal(m.emailExpiraAt, null);
    assert.equal(m.emailUsadoAt, null);
    assert.equal(m.liderDecisiones, null);
});

test('getLatestViewTokenMeta sin pool o servicio', async () => {
    assert.deepEqual(await getLatestViewTokenMeta(null, 'x', 2026, 7, 2), emptyEmailTokenMeta());
    assert.deepEqual(await getLatestViewTokenMeta({}, '', 2026, 7, 2), emptyEmailTokenMeta());
});

test('getLatestViewTokenMeta agrega decisiones del líder', async () => {
    const calls = [];
    const pool = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM conciliaciones_email_acciones')) {
                return {
                    rows: [
                        {
                            id: 'tok-1',
                            created_at: new Date('2026-07-10T10:00:00.000Z'),
                            expira_at: new Date('2026-07-13T10:00:00.000Z'),
                            usado_at: null,
                            recipient_email: 'lider@example.com'
                        }
                    ]
                };
            }
            if (sql.includes('FROM conciliaciones_email_decisiones')) {
                return {
                    rows: [
                        { decision: 'APROBADO', n: 2 },
                        { decision: 'RECHAZADO', n: 1 }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const meta = await getLatestViewTokenMeta(pool, 'svc-1', 2026, 7, 5);
    assert.equal(meta.emailRecipient, 'lider@example.com');
    assert.equal(meta.emailExpiraAt, '2026-07-13T10:00:00.000Z');
    assert.equal(meta.emailUsadoAt, null);
    assert.deepEqual(meta.liderDecisiones, {
        aprobados: 2,
        rechazados: 1,
        pendientes: 2,
        total: 5
    });
});
