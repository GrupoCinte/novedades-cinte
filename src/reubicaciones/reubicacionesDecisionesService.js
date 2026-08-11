'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Registrar una nueva decisión de aptitud (GP)
 * @param {Object} params
 * @param {string} params.pipelineId - ID del caso
 * @param {string} params.decision - 'APTO' o 'NO_APTO'
 * @param {string} params.justificacion - Justificación (obligatoria, max 500)
 * @param {Object} params.decididoPor - Usuario que decide (user_id, role)
 * @param {import('pg').Pool} params.pool - Pool de PostgreSQL
 * @returns {Promise<{ status: number, body: object }>}
 */
async function registrarDecision({ pipelineId, decision, justificacion, decididoPor, pool }) {
    // 1. Validaciones
    if (!decision || !['APTO', 'NO_APTO'].includes(decision)) {
        return {
            status: 400,
            body: { ok: false, error: 'Decisión debe ser APTO o NO_APTO' }
        };
    }

    if (!justificacion || justificacion.trim().length === 0) {
        return {
            status: 400,
            body: { ok: false, error: 'La justificación es obligatoria' }
        };
    }
    if (justificacion.length > 500) {
        return {
            status: 400,
            body: { ok: false, error: 'La justificación no puede exceder 500 caracteres' }
        };
    }

    // 2. Verificar que el caso existe
    const caseExists = await pool.query(
        'SELECT id, cedula FROM reubicaciones_pipeline WHERE id = $1',
        [pipelineId]
    );
    if (caseExists.rows.length === 0) {
        return {
            status: 404,
            body: { ok: false, error: 'Caso no encontrado' }
        };
    }

    // 3. Obtener decisión anterior (para historial)
    const previousDecision = await pool.query(
        'SELECT decision, justificacion FROM reubicaciones_decisiones WHERE pipeline_id = $1 ORDER BY fecha DESC LIMIT 1',
        [pipelineId]
    );

    // 4. Usar transacción
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insertar nueva decisión
        const result = await client.query(
            `INSERT INTO reubicaciones_decisiones 
             (id, pipeline_id, decision, justificacion, decidido_por_user_id, decidido_por_role, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             RETURNING *`,
            [
                uuidv4(),
                pipelineId,
                decision,
                justificacion.trim(),
                decididoPor.user_id,
                decididoPor.role
            ]
        );

        // Actualizar pipeline con la decisión (opcional: agregar columna aptitud)
        await client.query(
            `UPDATE reubicaciones_pipeline 
             SET updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [pipelineId]
        );

        // Registrar en historial de reubicaciones
        const estadoAnterior = previousDecision.rows[0]?.decision || 'SIN_DECISION';
        await client.query(
            `INSERT INTO reubicaciones_estado_historial 
             (pipeline_id, estado_anterior, estado_nuevo, evento_id, motivo, cambiado_en)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
            [
                pipelineId,
                estadoAnterior,
                `DECISION_${decision}`,
                `dec_${result.rows[0].id}`,
                `${decididoPor.role} decidió ${decision}: ${justificacion.trim().substring(0, 100)}...`
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
        console.error('[DecisionesService] Error:', error);
        return {
            status: 500,
            body: { ok: false, error: 'Error al guardar decisión' }
        };
    } finally {
        client.release();
    }
}

/**
 * Obtener la última decisión de un caso
 */
async function obtenerUltimaDecision({ pipelineId, pool }) {
    const result = await pool.query(
        `SELECT 
            d.*,
            u.email,
            u.full_name as decidido_por_nombre
         FROM reubicaciones_decisiones d
         LEFT JOIN users u ON d.decidido_por_user_id = u.id
         WHERE d.pipeline_id = $1
         ORDER BY d.fecha DESC
         LIMIT 1`,
        [pipelineId]
    );
    return result.rows[0] || null;
}

/**
 * Obtener todo el historial de decisiones de un caso
 */
async function obtenerHistorialDecisiones({ pipelineId, pool }) {
    const result = await pool.query(
        `SELECT 
            d.*,
            u.email,
            u.full_name as decidido_por_nombre
         FROM reubicaciones_decisiones d
         LEFT JOIN users u ON d.decidido_por_user_id = u.id
         WHERE d.pipeline_id = $1
         ORDER BY d.fecha DESC`,
        [pipelineId]
    );
    return result.rows;
}

/**
 * Verificar si un usuario puede decidir (GP o super_admin)
 */
function puedeDecidir(usuario) {
    const role = usuario?.role || usuario?.rol;
    return role === 'gp' || role === 'super_admin';
}

module.exports = {
    registrarDecision,
    obtenerUltimaDecision,
    obtenerHistorialDecisiones,
    puedeDecidir
};