'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Registrar una nueva observación de CH
 * @param {Object} params
 * @param {string} params.pipelineId - ID del caso
 * @param {string} params.observacion - Texto de la observación (1-1000 caracteres)
 * @param {Object} params.actor - Usuario que registra (user_id, role)
 * @param {import('pg').Pool} params.pool - Pool de PostgreSQL
 * @returns {Promise<{ status: number, body: object }>}
 */
async function registrarObservacion({ pipelineId, observacion, actor, pool }) {
    // 1. Validar longitud
    if (!observacion || observacion.trim().length === 0) {
        return {
            status: 400,
            body: { ok: false, error: 'La observación no puede estar vacía' }
        };
    }
    if (observacion.length > 1000) {
        return {
            status: 400,
            body: { ok: false, error: 'La observación no puede exceder 1000 caracteres' }
        };
    }

    try {
        // 2. Verificar que el caso existe
        const caseExists = await pool.query(
            'SELECT id FROM reubicaciones_pipeline WHERE id = $1',
            [pipelineId]
        );
        if (caseExists.rows.length === 0) {
            return {
                status: 404,
                body: { ok: false, error: 'Caso no encontrado' }
            };
        }

        // 3. Obtener última versión
        const lastVersion = await pool.query(
            'SELECT MAX(version) as max_version FROM reubicaciones_observaciones WHERE pipeline_id = $1',
            [pipelineId]
        );
        const nextVersion = (lastVersion.rows[0]?.max_version || 0) + 1;

        // 4. Insertar nueva observación
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

        // 5. Intentar guardar historial, pero SIN ROMPER si falla
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
                    `CH registró observación versión ${nextVersion}`
                ]
            );
        } catch (histError) {
            // Solo log, no romper la operación principal
            console.warn('⚠️ No se pudo guardar en reubicaciones_estado_historial:', histError.message);
        }

        return {
            status: 200,
            body: { 
                ok: true, 
                data: result.rows[0], 
                message: 'Observación guardada exitosamente' 
            }
        };
    } catch (error) {
        console.error('❌ Error en registrarObservacion:', error);
        console.error('❌ Stack:', error.stack);
        return {
            status: 500,
            body: { ok: false, error: error.message || 'Error al guardar observación' }
        };
    }
}

/**
 * Obtener la última observación de un caso
 * @param {Object} params
 * @param {string} params.pipelineId - ID del caso
 * @param {import('pg').Pool} params.pool - Pool de PostgreSQL
 * @returns {Promise<Object|null>}
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
        console.error('❌ Error en obtenerUltimaObservacion:', error);
        return null;
    }
}

/**
 * Obtener todo el historial de observaciones de un caso
 * @param {Object} params
 * @param {string} params.pipelineId - ID del caso
 * @param {import('pg').Pool} params.pool - Pool de PostgreSQL
 * @returns {Promise<Array>}
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
        console.error('❌ Error en obtenerHistorialObservaciones:', error);
        return [];
    }
}

module.exports = {
    registrarObservacion,
    obtenerUltimaObservacion,
    obtenerHistorialObservaciones
};