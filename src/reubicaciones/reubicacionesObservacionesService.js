'use strict';

const { v4: uuidv4 } = require('uuid');

async function registrarObservacion({ pipelineId, observacion, expectedVersion, actor, pool, idempotencyKey }) {
    if (!observacion || observacion.trim().length === 0) {
        return { status: 400, body: { ok: false, error: 'La observación no puede estar vacía' } };
    }
    if (observacion.length > 1000) {
        return { status: 400, body: { ok: false, error: 'La observación no puede exceder 1000 caracteres' } };
    }
    if (!idempotencyKey) {
        return { status: 400, body: { ok: false, error: 'Idempotency-Key es obligatoria' } };
    }
    if (expectedVersion == null) {
        return { status: 400, body: { ok: false, error: 'expectedVersion es obligatoria' } };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar si el caso existe y bloquearlo
        const caseExists = await client.query(
            'SELECT id, cedula AS consultor_id FROM reubicaciones_pipeline WHERE id = $1 FOR UPDATE',
            [pipelineId]
        );
        if (caseExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return { status: 404, body: { ok: false, error: 'Caso no encontrado' } };
        }
        const consultorId = caseExists.rows[0].consultor_id || null;

        // Comprobación de Idempotencia
        const existingIdem = await client.query(
            'SELECT * FROM reubicaciones_observaciones WHERE idempotency_key = $1',
            [idempotencyKey]
        );
        if (existingIdem.rows.length > 0) {
            await client.query('ROLLBACK');
            const existing = existingIdem.rows[0];
            if (existing.observacion === observacion.trim()) {
                return { status: 200, body: { ok: true, data: existing, message: 'Observación ya registrada (Idempotente)' } };
            } else {
                return { status: 409, body: { ok: false, error: 'Idempotency-Key ya usada con un payload diferente' } };
            }
        }

        // Obtener la versión actual para validar concurrencia
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
        
        // Obtener el texto anterior (solo informativo para el historial)
        let observacionAnterior = null;
        if (currentVersion > 0) {
            const antRes = await client.query(
                'SELECT observacion FROM reubicaciones_observaciones WHERE pipeline_id = $1 AND version = $2',
                [pipelineId, currentVersion]
            );
            observacionAnterior = antRes.rows[0]?.observacion || null;
        }

        const obsId = uuidv4();
        
        // Inserción de la observación
        const result = await client.query(
            `INSERT INTO reubicaciones_observaciones 
             (id, pipeline_id, version, observacion, actor_user_id, actor_role, idempotency_key, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             RETURNING *`,
            [
                obsId,
                pipelineId,
                nextVersion,
                observacion.trim(),
                actor.user_id,
                actor.role,
                idempotencyKey
            ]
        );

        // Inserción de historial (atómico)
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
                origen,
                fecha
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
                pipelineId,
                consultorId,
                'observacion_ch',
                actor.nombre || 'Usuario',
                actor.role,
                `Registro de observación (v${nextVersion})`,
                observacionAnterior ? JSON.stringify({ observacion: observacionAnterior }) : null,
                JSON.stringify({ observacion: observacion.trim() }),
                'backend'
            ]
        );

        await client.query('COMMIT');

        return {
            status: 200,
            body: { 
                ok: true, 
                data: result.rows[0], 
                message: 'Observación guardada exitosamente' 
            }
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registrarObservacion:', error);
        
        if (error.constraint === 'reubicaciones_observaciones_pipeline_id_version_key') {
            return { status: 409, body: { ok: false, error: 'Conflicto de versión concurrente' } };
        }
        if (error.constraint === 'reubicaciones_observaciones_idempotency_key_key') {
            return { status: 409, body: { ok: false, error: 'Conflicto de Idempotency-Key concurrente' } };
        }

        return {
            status: 500,
            body: { ok: false, error: 'Error al guardar observación' }
        };
    } finally {
        client.release();
    }
}

async function obtenerUltimaObservacion({ pipelineId, pool }) {
    try {
        const result = await pool.query(
            `SELECT 
                o.*,
                u.email,
                u.full_name as actor_nombre
             FROM reubicaciones_observaciones o
             LEFT JOIN users u ON o.actor_user_id = u.id
             WHERE o.pipeline_id = $1
             ORDER BY o.version DESC
             LIMIT 1`,
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
            `SELECT 
                o.*,
                u.email,
                u.full_name as actor_nombre
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
