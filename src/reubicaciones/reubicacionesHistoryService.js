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

/**
 * Registra un evento en el historial de reubicaciones.
 * 
 * @param {object} client - Cliente de PG dentro de una transacción.
 * @param {object} params - Parámetros del evento.
 * @param {string} params.caso_id - ID del caso en reubicaciones_pipeline.
 * @param {string} [params.consultor_id] - Cédula del consultor (opcional, se puede obtener del caso).
 * @param {string} params.tipo - Tipo de evento (ej: 'ficha_recibida', 'cambio_estado', 'observacion_ch', etc.).
 * @param {string} params.actor_nombre - Nombre de quien realiza la acción.
 * @param {string} params.actor_rol - Rol de quien realiza la acción.
 * @param {string} params.origen - Origen del evento ('MANUAL', 'SISTEMA', 'ZOHO', etc.).
 * @param {string} params.descripcion - Descripción legible del evento.
 * @param {object} [params.before_data] - Estado previo (opcional).
 * @param {object} [params.after_data] - Estado nuevo (opcional).
 * @param {string} params.source_event_id - Identificador único de origen para garantizar idempotencia.
 */
async function registrarEventoHistorial(client, params) {
    const {
        caso_id,
        consultor_id,
        tipo,
        actor_nombre,
        actor_rol,
        origen,
        descripcion,
        before_data = null,
        after_data = null,
        source_event_id
    } = params;

    if (!caso_id) throw new Error('registrarEventoHistorial: caso_id es obligatorio');
    if (!tipo) throw new Error('registrarEventoHistorial: tipo es obligatorio');
    if (!source_event_id) throw new Error('registrarEventoHistorial: source_event_id es obligatorio');

    // Sanitización de before_data y after_data
    const sanitizedBefore = sanitizarDatosHistorial(before_data);
    const sanitizedAfter = sanitizarDatosHistorial(after_data);
    
    const safeBeforeData = sanitizedBefore ? JSON.stringify(sanitizedBefore) : null;
    const safeAfterData = sanitizedAfter ? JSON.stringify(sanitizedAfter) : null;

    // SAVEPOINT para evitar abortar la transacción principal si hay conflicto de unicidad
    const savepointName = `sp_hist_${source_event_id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
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
                caso_id,
                consultor_id || null,
                tipo,
                actor_nombre || 'Sistema',
                normalizeRoleOrNull(actor_rol) || 'sistema',
                origen || 'SISTEMA',
                descripcion || '',
                safeBeforeData,
                safeAfterData,
                source_event_id
            ]
        );
        // Insert exitoso, liberamos savepoint
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
    } catch (e) {
        if (String(e?.code) === '23505') {
            return await handleIdempotencyConflict(client, savepointName, { caso_id, source_event_id, tipo }, e, safeBeforeData, safeAfterData);
        } else {
            // Otro tipo de error, hacemos rollback y re-lanzamos
            await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            throw e;
        }
    }
    
    return { idempotent: false, action: 'inserted' };
}

async function handleIdempotencyConflict(client, savepointName, params, error, safeBeforeData, safeAfterData) {
    // Revertimos la falla del insert para continuar operando en la transacción
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    
    // Consultamos el evento existente
    const existingRes = await client.query(
        `SELECT tipo, before_data, after_data FROM reubicaciones_historial WHERE caso_id = $1::uuid AND source_event_id = $2 LIMIT 1`,
        [params.caso_id, params.source_event_id]
    );
    if (existingRes.rows.length === 0) {
        throw error;
    }
    const existing = existingRes.rows[0];
    
    const existingBeforeStr = existing.before_data ? JSON.stringify(existing.before_data) : null;
    const existingAfterStr = existing.after_data ? JSON.stringify(existing.after_data) : null;

    const isSame = (
        existing.tipo === params.tipo &&
        existingBeforeStr === safeBeforeData &&
        existingAfterStr === safeAfterData
    );

    if (isSame) {
        return { idempotent: true, action: 'ignored' };
    } else {
        throw new IdempotencyConflictError(`Conflicto de Idempotencia: El source_event_id ${params.source_event_id} ya existe con datos diferentes.`);
    }
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
    const canonical = JSON.stringify(payload || {}, Object.keys(payload || {}).sort((left, right) => left.localeCompare(right)));
    return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}

module.exports = {
    registrarEventoHistorial,
    sanitizarDatosHistorial,
    generarHashPayload,
    IdempotencyConflictError
};
