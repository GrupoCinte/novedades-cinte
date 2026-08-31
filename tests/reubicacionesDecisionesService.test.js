'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registrarDecision } = require('../src/reubicaciones/reubicacionesDecisionesService');

const pipelineId = '11111111-1111-4111-8111-111111111111';
const actor = { user_id: '22222222-2222-4222-8222-222222222222', role: 'gp', nombre: 'GP de prueba' };

function createPool({ existingDecision = null, idempotentDecision = null } = {}) {
    const calls = [];
    const client = {
        async query(sql) {
            calls.push(sql);
            if (sql.includes('FROM reubicaciones_pipeline')) return { rows: [{ id: pipelineId, consultor_id: '123' }] };
            if (sql.includes('WHERE idempotency_key = $1')) return { rows: idempotentDecision ? [idempotentDecision] : [] };
            if (sql.includes('SELECT id FROM reubicaciones_decisiones WHERE pipeline_id')) return { rows: existingDecision ? [{ id: 'existing-decision' }] : [] };
            if (sql.includes('INSERT INTO reubicaciones_decisiones')) return { rows: [{ id: 'new-decision', pipeline_id: pipelineId, decision: 'APTO' }] };
            return { rows: [] };
        },
        release() {}
    };
    return { calls, async connect() { return client; } };
}

test('permite guardar la primera decisión', async () => {
    const pool = createPool();
    const result = await registrarDecision({ pipelineId, decision: 'APTO', justificacion: 'Cumple el perfil.', decididoPor: actor, pool, idempotencyKey: 'first-key' });

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.ok(pool.calls.some((sql) => sql.includes('INSERT INTO reubicaciones_decisiones')));
});

test('rechaza cambiar APTO a NO_APTO y NO_APTO a APTO', async (t) => {
    for (const [existing, requested] of [['APTO', 'NO_APTO'], ['NO_APTO', 'APTO']]) {
        await t.test(`${existing} no puede cambiar a ${requested}`, async () => {
            const pool = createPool({ existingDecision: existing });
            const result = await registrarDecision({ pipelineId, decision: requested, justificacion: 'Nueva justificación.', decididoPor: actor, pool, idempotencyKey: `${existing}-${requested}` });

            assert.equal(result.status, 409);
            assert.equal(result.body.ok, false);
            assert.match(result.body.error, /no puede modificarse/);
            assert.equal(pool.calls.some((sql) => sql.includes('INSERT INTO reubicaciones_decisiones')), false);
        });
    }
});

test('acepta el reintento idempotente de la decisión original', async () => {
    const idempotentDecision = { id: 'existing-decision', decision: 'APTO', justificacion: 'Cumple el perfil.' };
    const pool = createPool({ existingDecision: 'APTO', idempotentDecision });
    const result = await registrarDecision({ pipelineId, decision: 'APTO', justificacion: 'Cumple el perfil.', decididoPor: actor, pool, idempotencyKey: 'same-key' });

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.match(result.body.message, /Idempotente/);
    assert.equal(pool.calls.some((sql) => sql.includes('SELECT id FROM reubicaciones_decisiones WHERE pipeline_id')), false);
});
