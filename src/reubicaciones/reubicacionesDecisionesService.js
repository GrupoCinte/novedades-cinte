'use strict';

const { v4: uuidv4 } = require('uuid');

async function registrarDecision({ pipelineId, decision, justificacion, decididoPor, pool, idempotencyKey }) {
    if (!decision || !['APTO', 'NO_APTO'].includes(decision)) {
        return { status: 400, body: { ok: false, error: 'Decisión debe ser APTO o NO_APTO' } };
    }
    if (!justificacion || justificacion.trim().length === 0) {
        return { status: 400, body: { ok: false, error: 'La justificación es obligatoria' } };
    }
    if (justificacion.length > 500) {
        return { status: 400, body: { ok: false, error: 'La justificación no puede exceder 500 caracteres' } };
    }
    if (!idempotencyKey) {
        return { status: 400, body: { ok: false, error: 'Idempotency-Key es obligatoria' } };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar existencia del caso y bloquearlo para evitar concurrencia en la misma decisión
        const caseExists = await client.query(
            'SELECT id, cedula, consultor_id FROM reubicaciones_pipeline WHERE id = $1 FOR UPDATE',
            [pipelineId]
        );
        if (caseExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return { status: 404, body: { ok: false, error: 'Caso no encontrado' } };
        }
        const consultorId = caseExists.rows[0].consultor_id || null;

        // Comprobación de Idempotencia
        const existingIdem = await client.query(
            'SELECT * FROM reubicaciones_decisiones WHERE idempotency_key = $1',
            [idempotencyKey]
        );
        if (existingIdem.rows.length > 0) {
            await client.query('ROLLBACK');
            const existing = existingIdem.rows[0];
            if (existing.decision === decision && existing.justificacion === justificacion.trim()) {
                return { status: 200, body: { ok: true, data: existing, message: 'Decisión ya registrada (Idempotente)' } };
            } else {
                return { status: 409, body: { ok: false, error: 'Idempotency-Key ya usada con un payload diferente' } };
            }
        }

        // Obtener decisión anterior para historial
        const previousDecision = await client.query(
            'SELECT decision, justificacion FROM reubicaciones_decisiones WHERE pipeline_id = $1 ORDER BY fecha DESC LIMIT 1',
            [pipelineId]
        );
        const decisionAnterior = previousDecision.rows[0]?.decision || null;

        const decId = uuidv4();

        // Inserción de la decisión
        const result = await client.query(
            `INSERT INTO reubicaciones_decisiones 
             (id, pipeline_id, decision, justificacion, actor_user_id, actor_role, idempotency_key, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             RETURNING *`,
            [
                decId,
                pipelineId,
                decision,
                justificacion.trim(),
                decididoPor.user_id,
                decididoPor.role,
                idempotencyKey
            ]
        );

        // Actualizar pipeline (timestamp para reflejar actividad)
        await client.query(
            `UPDATE reubicaciones_pipeline 
             SET updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [pipelineId]
        );

        // Inserción en historial (atómico)
        await client.query(
            `INSERT INTO reubicaciones_historial (
                caso_id,
                consultor_id,
                tipo,
                actor_nombre,
                actor_rol,
                descripcion,
                before_data,
                after_data,
                fecha
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
                pipelineId,
                consultorId,
                'decision_aptitud',
                decididoPor.nombre || 'Usuario',
                decididoPor.role,
                `Decisión: ${decision}`,
                decisionAnterior ? JSON.stringify({ decision: decisionAnterior }) : null,
                JSON.stringify({ decision, justificacion: justificacion.trim() })
            ]
        );

        await client.query('COMMIT');

        return {
            status: 200,
            body: { 
                ok: true, 
                data: result.rows[0], 
                message: 'Decisión guardada exitosamente' 
            }
        };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registrarDecision:', error);

        if (error.constraint === 'reubicaciones_decisiones_idempotency_key_key') {
            return { status: 409, body: { ok: false, error: 'Conflicto de Idempotency-Key concurrente' } };
        }

        return {
            status: 500,
            body: { ok: false, error: 'Error al guardar decisión' }
        };
    } finally {
        client.release();
    }
}

async function obtenerUltimaDecision({ pipelineId, pool }) {
    try {
        const result = await pool.query(
            `SELECT 
                d.*,
                u.email,
                u.full_name as actor_nombre
             FROM reubicaciones_decisiones d
             LEFT JOIN users u ON d.actor_user_id = u.id
             WHERE d.pipeline_id = $1
             ORDER BY d.fecha DESC
             LIMIT 1`,
            [pipelineId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error en obtenerUltimaDecision:', error);
        return null;
    }
}

async function obtenerHistorialDecisiones({ pipelineId, pool }) {
    try {
        const result = await pool.query(
            `SELECT 
                d.*,
                u.email,
                u.full_name as actor_nombre
             FROM reubicaciones_decisiones d
             LEFT JOIN users u ON d.actor_user_id = u.id
             WHERE d.pipeline_id = $1
             ORDER BY d.fecha DESC`,
            [pipelineId]
        );
        return result.rows || [];
    } catch (error) {
        console.error('Error en obtenerHistorialDecisiones:', error);
        return [];
    }
}

module.exports = {
    registrarDecision,
    obtenerUltimaDecision,
    obtenerHistorialDecisiones
};
