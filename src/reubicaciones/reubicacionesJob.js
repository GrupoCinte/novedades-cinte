const { Pool } = require('pg');
const { getFestivosSet } = require('../festivosService');
const { diasHabilesTranscurridos } = require('./reubicacionesCalendario');
const { registrarEventoHistorial } = require('./reubicacionesHistoryService');

/**
 * Job para procesar la transición automática del ciclo de 5 días hábiles (HU-05/HU-06).
 * Busca casos 'En proceso' sin decisión y que excedan los 5 días hábiles.
 * @param {Pool} pool 
 * @param {object} logger 
 */
async function processVencimiento5Dias(pool, logger) {
    const festivosSet = await getFestivosSet();
    const hoy = new Date();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Select cases that are active, have no decision, and don't have a 'transicion_automatica' event for closure
        const res = await client.query(`
            SELECT rp.*
            FROM reubicaciones_pipeline rp
            LEFT JOIN reubicaciones_decisiones rd ON rd.pipeline_id = rp.id
            WHERE rp.estado IS DISTINCT FROM 'Cerrado'
              AND rd.id IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM reubicaciones_historial rh 
                  WHERE rh.caso_id = rp.id AND rh.tipo = 'transicion_automatica'
              )
            FOR UPDATE OF rp SKIP LOCKED
        `);

        for (const row of res.rows) {
            const dias = diasHabilesTranscurridos(row.fecha_fin, hoy, festivosSet);
            if (dias > 5) {
                // HU-06: Cerrar lógicamente el caso para que salga de la tabla activa
                await client.query(
                    `UPDATE reubicaciones_pipeline SET estado = 'Cerrado', updated_at = NOW() WHERE id = $1`,
                    [row.id]
                );

                await registrarEventoHistorial(client, {
                    caso_id: row.id,
                    consultor_id: row.cedula,
                    tipo: 'transicion_automatica',
                    actor_nombre: 'Sistema Integración',
                    actor_rol: 'SISTEMA',
                    origen: 'SISTEMA',
                    descripcion: 'Vencimiento de 5 días hábiles sin decisión (Cierre automático)',
                    before_data: { estado: row.estado, dias_transcurridos: dias },
                    after_data: { estado: 'Cerrado', dias_transcurridos: dias },
                    source_event_id: `auto_vencimiento_${row.id}`
                });
                
                if (logger) logger.info({ caso_id: row.id, cedula: row.cedula, dias }, 'Caso cerrado automáticamente por vencimiento de 5 días.');
            }
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        if (logger) logger.error({ error: e.message }, 'Error procesando vencimientos de 5 días');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
    processVencimiento5Dias
};
