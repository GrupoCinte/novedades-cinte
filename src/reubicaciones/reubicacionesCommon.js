'use strict';

/**
 * Verifica si el pipeline existe y obtiene un bloqueo exclusivo (FOR UPDATE).
 * @param {Object} client - Cliente PostgreSQL (transacción activa)
 * @param {string} pipelineId - ID del pipeline
 * @returns {Promise<string|null>} - consultorId o lanza error si no existe
 */
async function lockPipeline(client, pipelineId) {
    const res = await client.query(
        'SELECT id, cedula AS consultor_id FROM reubicaciones_pipeline WHERE id = $1 FOR UPDATE',
        [pipelineId]
    );
    if (res.rows.length === 0) {
        const err = new Error('Caso no encontrado');
        err.status = 404;
        throw err;
    }
    return res.rows[0].consultor_id || null;
}

/**
 * Verifica idempotencia en una tabla dada.
 * @param {Object} client - Cliente PostgreSQL
 * @param {string} table - Nombre de la tabla
 * @param {string} idempotencyKey - Llave enviada por frontend
 * @param {function} isSamePayloadFn - Callback para comparar si el payload es el mismo
 * @returns {Promise<Object|null>} - Fila si ya existe, nulo si es nueva. Lanza error si hay conflicto de payload.
 */
async function checkIdempotency(client, table, idempotencyKey, isSamePayloadFn) {
    // Para simplificar, la consulta asume columnas seguras
    const q = `SELECT * FROM ${table} WHERE idempotency_key = $1`;
    const res = await client.query(q, [idempotencyKey]);
    
    if (res.rows.length > 0) {
        const existing = res.rows[0];
        if (isSamePayloadFn(existing)) {
            return existing;
        }
        const err = new Error('Idempotency-Key ya usada con un payload diferente');
        err.status = 409;
        throw err;
    }
    return null;
}

/**
 * Inserta un registro transaccionalmente en reubicaciones_historial.
 */
async function insertHistory(client, { pipelineId, consultorId, tipo, actor, descripcion, beforeData, afterData, origen = 'backend' }) {
    await client.query(
        `INSERT INTO reubicaciones_historial (
            caso_id, consultor_id, tipo, actor_nombre, actor_rol, descripcion, before_data, after_data, origen, fecha
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
            pipelineId,
            consultorId,
            tipo,
            actor.nombre || 'Usuario',
            actor.role,
            descripcion,
            beforeData ? JSON.stringify(beforeData) : null,
            afterData ? JSON.stringify(afterData) : null,
            origen
        ]
    );
}

module.exports = {
    lockPipeline,
    checkIdempotency,
    insertHistory
};
