/**
 * Servicio Centralizado para el Historial Integral de Reubicaciones (HU-06)
 * 
 * ATENCIÓN: Este servicio debe ser invocado SIEMPRE pasándole un `client` de PostgreSQL
 * que esté dentro de un bloque de transacción (BEGIN ... COMMIT). 
 * No utilizar `pool` directamente para garantizar la atomicidad (comando + historial).
 */

const { normalizeRoleOrNull } = require('../rbac');
const crypto = require('crypto');

class IdempotencyConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IdempotencyConflictError';
    }
}

async function _executeInsertAndHandleConflicts(client, params, safeBeforeData, safeAfterData) {
    const savepointName = `sp_hist_${params.source_event_id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    await client.query(`SAVEPOINT ${savepointName}`);

    try {
        await client.query(
            `INSERT INTO reubicaciones_historial (
                caso_id,
                consultor_id,
                tipo,
                actor_nombre,
                actor_rol,
                origen,
                descripcion,
                before_data,
                after_data,
                source_event_id,
                fecha
            ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, NOW())`,
            [
                params.caso_id,
                params.consultor_id || null,
                params.tipo,
                params.actor_nombre || 'Sistema',
                normalizeRoleOrNull(params.actor_rol) || 'sistema',
                params.origen || 'SISTEMA',
                params.descripcion || '',
                safeBeforeData,
                safeAfterData,
                params.source_event_id
            ]
        );
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        return { idempotent: false, action: 'inserted' };
    } catch (e) {
        if (String(e?.code) === '23505') {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            
            const existingRes = await client.query(
                `SELECT tipo, before_data, after_data FROM reubicaciones_historial WHERE caso_id = $1::uuid AND source_event_id = $2 LIMIT 1`,
                [params.caso_id, params.source_event_id]
            );
            if (existingRes.rows.length === 0) throw e;
            const existing = existingRes.rows[0];
            
            const existingBeforeStr = existing.before_data ? JSON.stringify(existing.before_data) : null;
            const existingAfterStr = existing.after_data ? JSON.stringify(existing.after_data) : null;

            const isSame = (existing.tipo === params.tipo && existingBeforeStr === safeBeforeData && existingAfterStr === safeAfterData);
            if (isSame) return { idempotent: true, action: 'ignored' };
            throw new IdempotencyConflictError(`Conflicto de Idempotencia: El source_event_id ${params.source_event_id} ya existe con datos diferentes.`);
        } else {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            throw e;
        }
    }
}

/**
 * Registra un evento en el historial de reubicaciones.
 * 
 * @param {object} client - Cliente de PG dentro de una transacción.
 * @param {object} params - Parámetros del evento.
 */
async function registrarEventoHistorial(client, params) {
    if (!params.caso_id) throw new Error('registrarEventoHistorial: caso_id es obligatorio');
    if (!params.tipo) throw new Error('registrarEventoHistorial: tipo es obligatorio');
    if (!params.source_event_id) throw new Error('registrarEventoHistorial: source_event_id es obligatorio');

    const sanitizedBefore = sanitizarDatosHistorial(params.before_data || null);
    const sanitizedAfter = sanitizarDatosHistorial(params.after_data || null);
    
    const safeBeforeData = sanitizedBefore ? JSON.stringify(sanitizedBefore) : null;
    const safeAfterData = sanitizedAfter ? JSON.stringify(sanitizedAfter) : null;

    return await _executeInsertAndHandleConflicts(client, params, safeBeforeData, safeAfterData);
}

/**
 * FASE 3: Sanitización de datos sensibles antes de guardarlos en el historial.
 * Recursivamente busca llaves sensibles y las redacta.
 */
function sanitizarDatosHistorial(data) {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveKeys = new Set([
        'password', 'token', 'access_token', 'refresh_token', 'secret', 
        'hash', 'apikey', 'authorization', 'clave', 'pwd'
    ]);
    
    if (Array.isArray(data)) {
        return data.map(item => sanitizarDatosHistorial(item));
    }
    
    const result = { ...data };
    for (const key of Object.keys(result)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
            result[key] = '[REDACTED]';
        } else if (typeof result[key] === 'object' && result[key] !== null) {
            result[key] = sanitizarDatosHistorial(result[key]);
        }
    }
    return result;
}

function generarHashPayload(payload) {
    const canonical = JSON.stringify(payload || {}, Object.keys(payload || {}).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}

module.exports = {
    registrarEventoHistorial,
    sanitizarDatosHistorial,
    generarHashPayload,
    IdempotencyConflictError
};
