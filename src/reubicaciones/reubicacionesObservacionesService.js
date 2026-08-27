'use strict';

const { v4: uuidv4 } = require('uuid');
const { lockPipeline, checkIdempotency, insertHistory } = require('./reubicacionesCommon');

function validateInput(observacion, expectedVersion, idempotencyKey) {
    if (!observacion || observacion.trim().length === 0) return 'La observación no puede estar vacía';
    if (observacion.length > 1000) return 'La observación no puede exceder 1000 caracteres';
    if (!idempotencyKey) return 'Idempotency-Key es obligatoria';
    if (expectedVersion == null) return 'expectedVersion es obligatoria';
    return null;
}

async function registrarObservacion({ pipelineId, observacion, expectedVersion, actor, pool, idempotencyKey }) {
    const errorMsg = validateInput(observacion, expectedVersion, idempotencyKey);
    if (errorMsg) return { status: 400, body: { ok: false, error: errorMsg } };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar caso
        const consultorId = await lockPipeline(client, pipelineId);

        // 2. Verificar idempotencia
        const existing = await checkIdempotency(
            client, 
            'reubicaciones_observaciones', 
            idempotencyKey, 
            (row) => row.observacion === observacion.trim()
        );
        if (existing) {
            await client.query('ROLLBACK');
            return { status: 200, body: { ok: true, data: existing, message: 'Observación ya registrada (Idempotente)' } };
        }

        // 3. Concurrencia
        const lastVersionRes = await client.query(
            'SELECT MAX(version) as max_version FROM reubicaciones_observaciones WHERE pipeline_id = $1', 
            [pipelineId]
        );
        const currentVersion = lastVersionRes.rows[0].max_version || 0;
        
        if (expectedVersion !== currentVersion) {
            await client.query('ROLLBACK');
            return { 
                status: 409, 
                body: { ok: false, error: 'Conflicto de versión: Otro usuario ha modificado la observación. Recarga para ver los cambios.', currentVersion } 
            };
        }

        const nextVersion = currentVersion + 1;
        
        // 4. Histórico anterior
        let observacionAnterior = null;
        if (currentVersion > 0) {
            const antRes = await client.query('SELECT observacion FROM reubicaciones_observaciones WHERE pipeline_id = $1 AND version = $2', [pipelineId, currentVersion]);
            observacionAnterior = antRes.rows[0]?.observacion || null;
        }

        // 5. Inserción
        const result = await client.query(
            `INSERT INTO reubicaciones_observaciones 
             (id, pipeline_id, version, observacion, actor_user_id, actor_role, idempotency_key, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *`,
            [uuidv4(), pipelineId, nextVersion, observacion.trim(), actor.user_id, actor.role, idempotencyKey]
        );

        // 6. Historial
        await insertHistory(client, {
            pipelineId,
            consultorId,
            tipo: 'observacion_ch',
            actor,
            descripcion: `Registro de observación (v${nextVersion})`,
            beforeData: observacionAnterior ? { observacion: observacionAnterior } : null,
            afterData: { observacion: observacion.trim() }
        });

        await client.query('COMMIT');
        return { status: 200, body: { ok: true, data: result.rows[0], message: 'Observación guardada exitosamente' } };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registrarObservacion:', error);
        
        if (error.status) return { status: error.status, body: { ok: false, error: error.message } };
        if (error.constraint === 'reubicaciones_observaciones_pipeline_id_version_key') return { status: 409, body: { ok: false, error: 'Conflicto de versión concurrente' } };
        if (error.constraint === 'reubicaciones_observaciones_idempotency_key_key') return { status: 409, body: { ok: false, error: 'Conflicto de Idempotency-Key concurrente' } };

        return { status: 500, body: { ok: false, error: 'Error al guardar observación' } };
    } finally {
        client.release();
    }
}

async function obtenerUltimaObservacion({ pipelineId, pool }) {
    try {
        const result = await pool.query(
            `SELECT o.*, u.email, u.full_name as actor_nombre
             FROM reubicaciones_observaciones o
             LEFT JOIN users u ON o.actor_user_id = u.id
             WHERE o.pipeline_id = $1
             ORDER BY o.version DESC LIMIT 1`,
            [pipelineId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error en obtenerUltimaObservacion:', error);
        return null;
    }
}

async function obtenerHistorialObservaciones({ pipelineId, pool }) {
    try {
        const result = await pool.query(
            `SELECT o.*, u.email, u.full_name as actor_nombre
             FROM reubicaciones_observaciones o
             LEFT JOIN users u ON o.actor_user_id = u.id
             WHERE o.pipeline_id = $1
             ORDER BY o.version DESC`,
            [pipelineId]
        );
        return result.rows || [];
    } catch (error) {
        console.error('Error en obtenerHistorialObservaciones:', error);
        return [];
    }
}

module.exports = {
    registrarObservacion,
    obtenerUltimaObservacion,
    obtenerHistorialObservaciones
};
