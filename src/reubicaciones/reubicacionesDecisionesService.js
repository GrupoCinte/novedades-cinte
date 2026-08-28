'use strict';

const { v4: uuidv4 } = require('uuid');
const { lockPipeline, checkIdempotency, insertHistory } = require('./reubicacionesCommon');

function validateInput(decision, justificacion, idempotencyKey) {
    if (!decision || !['APTO', 'NO_APTO'].includes(decision)) return 'Decisión debe ser APTO o NO_APTO';
    if (!justificacion || justificacion.trim().length === 0) return 'La justificación es obligatoria';
    if (justificacion.length > 500) return 'La justificación no puede exceder 500 caracteres';
    if (!idempotencyKey) return 'Idempotency-Key es obligatoria';
    return null;
}

async function registrarDecision({ pipelineId, decision, justificacion, decididoPor, pool, idempotencyKey }) {
    const errorMsg = validateInput(decision, justificacion, idempotencyKey);
    if (errorMsg) return { status: 400, body: { ok: false, error: errorMsg } };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar caso y bloquear concurrencia
        const consultorId = await lockPipeline(client, pipelineId);

        // 2. Comprobación de Idempotencia
        const existing = await checkIdempotency(
            client, 
            'reubicaciones_decisiones', 
            idempotencyKey, 
            (row) => row.decision === decision && row.justificacion === justificacion.trim()
        );
        if (existing) {
            await client.query('ROLLBACK');
            return { status: 200, body: { ok: true, data: existing, message: 'Decisión ya registrada (Idempotente)' } };
        }

        // 3. Obtener decisión anterior para historial
        const prevRes = await client.query('SELECT decision FROM reubicaciones_decisiones WHERE pipeline_id = $1 ORDER BY fecha DESC LIMIT 1', [pipelineId]);
        const decisionAnterior = prevRes.rows[0]?.decision || null;

        // 4. Inserción
        const result = await client.query(
            `INSERT INTO reubicaciones_decisiones 
             (id, pipeline_id, decision, justificacion, actor_user_id, actor_role, idempotency_key, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             ON CONFLICT (pipeline_id) DO UPDATE SET
                decision = EXCLUDED.decision,
                justificacion = EXCLUDED.justificacion,
                actor_user_id = EXCLUDED.actor_user_id,
                actor_role = EXCLUDED.actor_role,
                idempotency_key = EXCLUDED.idempotency_key,
                fecha = CURRENT_TIMESTAMP
             RETURNING *`,
            [uuidv4(), pipelineId, decision, justificacion.trim(), decididoPor.user_id, decididoPor.role, idempotencyKey]
        );

        await client.query('UPDATE reubicaciones_pipeline SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [pipelineId]);

        // 5. Historial
        await insertHistory(client, {
            pipelineId,
            consultorId,
            tipo: 'decision_aptitud',
            actor: decididoPor,
            descripcion: `Decisión registrada: ${decision}`,
            beforeData: decisionAnterior ? { decision: decisionAnterior } : null,
            afterData: { decision, justificacion: justificacion.trim() }
        });

        await client.query('COMMIT');
        return { status: 200, body: { ok: true, data: result.rows[0], message: 'Decisión guardada exitosamente' } };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registrarDecision:', error);

        if (error.status) return { status: error.status, body: { ok: false, error: error.message } };
        if (error.constraint === 'reubicaciones_decisiones_idempotency_key_key') return { status: 409, body: { ok: false, error: 'Conflicto de Idempotency-Key concurrente' } };

        return { status: 500, body: { ok: false, error: 'Error al guardar decisión' } };
    } finally {
        client.release();
    }
}

async function obtenerUltimaDecision({ pipelineId, pool }) {
    try {
        const result = await pool.query(
            `SELECT d.*, u.email, u.full_name as actor_nombre
             FROM reubicaciones_decisiones d
             LEFT JOIN users u ON d.actor_user_id = u.id
             WHERE d.pipeline_id = $1
             ORDER BY d.fecha DESC LIMIT 1`,
            [pipelineId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error en obtenerUltimaDecision:', error);
        return null;
    }
}

module.exports = {
    registrarDecision,
    obtenerUltimaDecision
};
