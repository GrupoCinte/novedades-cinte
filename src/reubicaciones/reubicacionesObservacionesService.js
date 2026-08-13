'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Registrar una nueva observacion de CH
 */
async function registrarObservacion({ pipelineId, observacion, actor, pool }) {
    // 1. Validar longitud
    if (!observacion || observacion.trim().length === 0) {
        return {
            status: 400,
            body: { ok: false, error: 'La observacion no puede estar vacia' }
        };
    }
    if (observacion.length > 1000) {
        return {
            status: 400,
            body: { ok: false, error: 'La observacion no puede exceder 1000 caracteres' }
        };
    }

    try {
        // 2. Verificar que el caso existe Y obtener consultor_id
        const caseExists = await pool.query(
            'SELECT id, consultor_id FROM reubicaciones_pipeline WHERE id = $1',
            [pipelineId]
        );
        if (caseExists.rows.length === 0) {
            return {
                status: 404,
                body: { ok: false, error: 'Caso no encontrado' }
            };
        }
        const consultorId = caseExists.rows[0]?.consultor_id || null;

        // 3. Obtener ultima version Y la observacion anterior
        const lastVersion = await pool.query(
            'SELECT MAX(version) as max_version, observacion FROM reubicaciones_observaciones WHERE pipeline_id = $1 GROUP BY observacion', 
            [pipelineId]
        );
        const nextVersion = (lastVersion.rows[0]?.max_version || 0) + 1;
        const observacionAnterior = lastVersion.rows[0]?.observacion || null;  

        // 4. Insertar nueva observacion
        const result = await pool.query(
            `INSERT INTO reubicaciones_observaciones 
             (id, pipeline_id, version, observacion, actor_user_id, actor_role, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             RETURNING *`,
            [
                uuidv4(),
                pipelineId,
                nextVersion,
                observacion.trim(),
                actor.user_id,
                actor.role
            ]
        );

                // Insertar en reubicaciones_historial (HU-06)
        try {
            await pool.query(
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
                    'observacion_ch',
                    actor.nombre || 'Usuario',
                    actor.role,
                    `Registro de observación (v${nextVersion})`,
                    observacionAnterior ? JSON.stringify({ observacion: observacionAnterior }) : null,
                    JSON.stringify({ observacion: observacion.trim() })
                ]
            );
        } catch (histError) {
            // ✅ LOG COMPLETO DEL ERROR
            console.error('❌ ERROR en reubicaciones_historial:', {
                message: histError.message,
                stack: histError.stack,
                code: histError.code,
                detail: histError.detail,
                pipelineId,
                consultorId,
                nextVersion
            });
        }


        // Guardar en estado_historial (opcional - para compatibilidad)
        try {
            await pool.query(
                `INSERT INTO reubicaciones_estado_historial 
                 (pipeline_id, estado_anterior, estado_nuevo, evento_id, motivo, cambiado_en)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [
                    pipelineId,
                    'OBSERVACION_PREVIA',
                    'OBSERVACION_REGISTRADA',
                    `obs_${result.rows[0].id}`,
                    `CH registro observacion version ${nextVersion}`
                ]
            );
        } catch (histError) {
            console.warn('No se pudo guardar en reubicaciones_estado_historial:', histError.message);
        }

        return {
            status: 200,
            body: { 
                ok: true, 
                data: result.rows[0], 
                message: 'Observacion guardada exitosamente' 
            }
        };
    } catch (error) {
        console.error('Error en registrarObservacion:', error);
        console.error('Stack:', error.stack);
        return {
            status: 500,
            body: { ok: false, error: error.message || 'Error al guardar observacion' }
        };
    }
}

/**
 * Obtener la ultima observacion de un caso
 */
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

/**
 * Obtener todo el historial de observaciones de un caso
 */
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