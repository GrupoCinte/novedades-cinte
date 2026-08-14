'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Registrar una nueva decision de aptitud (GP)
 * @param {Object} params
 * @param {string} params.pipelineId - ID del caso
 * @param {string} params.decision - 'APTO' o 'NO_APTO'
 * @param {string} params.justificacion - Justificacion (obligatoria, max 500)
 * @param {Object} params.decididoPor - Usuario que decide (user_id, role)
 * @param {import('pg').Pool} params.pool - Pool de PostgreSQL
 * @returns {Promise<{ status: number, body: object }>}
 */
async function registrarDecision({ pipelineId, decision, justificacion, decididoPor, pool }) {
    // 1. Validaciones
    if (!decision || !['APTO', 'NO_APTO'].includes(decision)) {
        return {
            status: 400,
            body: { ok: false, error: 'Decision debe ser APTO o NO_APTO' }
        };
    }

    if (!justificacion || justificacion.trim().length === 0) {
        return {
            status: 400,
            body: { ok: false, error: 'La justificacion es obligatoria' }
        };
    }
    if (justificacion.length > 500) {
        return {
            status: 400,
            body: { ok: false, error: 'La justificacion no puede exceder 500 caracteres' }
        };
    }

    try {
        const caseExists = await pool.query(
            'SELECT id, cedula, consultor_id FROM reubicaciones_pipeline WHERE id = $1',
            [pipelineId]
        );
        if (caseExists.rows.length === 0) {
            return {
                status: 404,
                body: { ok: false, error: 'Caso no encontrado' }
            };
        }
        const consultorId = caseExists.rows[0]?.consultor_id || null;

        const previousDecision = await pool.query(
            'SELECT decision, justificacion FROM reubicaciones_decisiones WHERE pipeline_id = $1 ORDER BY fecha DESC LIMIT 1',
            [pipelineId]
        );
        const decisionAnterior = previousDecision.rows[0]?.decision || null;

        // 4. Usar transaccion
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insertar nueva decision
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

            // Actualizar pipeline con la decision
            await client.query(
                `UPDATE reubicaciones_pipeline 
                 SET updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [pipelineId]
            );

            // Insertar en reubicaciones_historial (HU-06)
            try {
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
                        `Decision: ${decision}`,
                        decisionAnterior ? JSON.stringify({ decision: decisionAnterior }) : null,
                        JSON.stringify({ decision, justificacion: justificacion.trim() })
                    ]
                );
            } catch (histError) {
                console.warn('No se pudo guardar en reubicaciones_historial:', histError.message);
            }

            // Registrar en historial de estado (opcional)
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
                    `${decididoPor.role} decidio ${decision}: ${justificacion.trim().substring(0, 100)}...`
                ]
            );

            await client.query('COMMIT');

            return {
                status: 200,
                body: { 
                    ok: true, 
                    data: result.rows[0], 
                    message: 'Decision guardada exitosamente' 
                }
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[DecisionesService] Error:', error);
            return {
                status: 500,
                body: { ok: false, error: 'Error al guardar decision' }
            };
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error en registrarDecision:', error);
        return {
            status: 500,
            body: { ok: false, error: error.message || 'Error al guardar decision' }
        };
    }
}


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