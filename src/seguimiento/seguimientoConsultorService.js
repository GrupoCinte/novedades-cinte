function createSeguimientoConsultorService({ pool }) {
    if (!pool) throw new Error('createSeguimientoConsultorService requiere pool');

    async function listActasConsultor({ cedula, email }) {
        if (!cedula && !email) return [];
        const sql = `
            SELECT a.id, a.fecha_acta, a.cliente, a.estado, a.tipo, a.created_at
            FROM seguimiento_acta a
            WHERE a.tipo = 'consultor'
              AND UPPER(a.estado) = 'FINALIZADO'
              AND a.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 
                  FROM seguimiento_participante p 
                  WHERE p.acta_id = a.id 
                    AND p.rol ILIKE 'consultor'
                    AND (p.cedula = $1 OR (p.email IS NOT NULL AND p.email = $2))
              )
            ORDER BY a.fecha_acta DESC, a.created_at DESC
        `;
        const res = await pool.query(sql, [cedula, email]);
        return res.rows;
    }

    async function getActaConsultor({ id, cedula, email }) {
        if (!id || (!cedula && !email)) return null;
        const sql = `
            SELECT a.*
            FROM seguimiento_acta a
            WHERE a.id = $1
              AND a.tipo = 'consultor'
              AND UPPER(a.estado) = 'FINALIZADO'
              AND a.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 
                  FROM seguimiento_participante p 
                  WHERE p.acta_id = a.id 
                    AND p.rol ILIKE 'consultor'
                    AND (p.cedula = $2 OR (p.email IS NOT NULL AND p.email = $3))
              )
        `;
        const res = await pool.query(sql, [id, cedula, email]);
        if (res.rows.length === 0) return null;

        const acta = res.rows[0];
        
        const partsRes = await pool.query(
            `SELECT rol, cedula, email, nombre, observacion, observacion_at FROM seguimiento_participante WHERE acta_id = $1 ORDER BY rol, nombre`,
            [id]
        );
        acta.participantes = partsRes.rows;
        
        return acta;
    }

    async function addObservacionConsultor({ id, cedula, email, observacion }) {
        if (!id || (!cedula && !email)) throw new Error('ID de acta y credenciales requeridas.');
        if (typeof observacion !== 'string') throw new Error('Observación inválida.');
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const sqlActa = `
                SELECT a.estado, a.finalizado_at
                FROM seguimiento_acta a
                WHERE a.id = $1
                  AND a.tipo = 'consultor'
                  AND UPPER(a.estado) = 'FINALIZADO'
                  AND a.deleted_at IS NULL
                FOR UPDATE
            `;
            const actaRes = await client.query(sqlActa, [id]);
            if (actaRes.rows.length === 0) {
                throw new Error('Acta no encontrada, eliminada o no finalizada.');
            }
            const acta = actaRes.rows[0];
            
            if (!acta.finalizado_at) {
                throw new Error('El acta no tiene fecha de finalización válida.');
            }

            const finalizadoMs = new Date(acta.finalizado_at).getTime();
            const nowMs = new Date().getTime();
            const diffMs = nowMs - finalizadoMs;
            const msIn72Hours = 72 * 60 * 60 * 1000;

            if (diffMs > msIn72Hours) {
                throw new Error('El plazo de 72 horas para registrar observaciones ha finalizado.');
            }

            const sqlPart = `
                SELECT id 
                FROM seguimiento_participante 
                WHERE acta_id = $1 
                  AND rol ILIKE 'consultor'
                  AND (cedula = $2 OR (email IS NOT NULL AND email = $3))
            `;
            const partRes = await client.query(sqlPart, [id, cedula, email]);
            if (partRes.rows.length === 0) {
                throw new Error('No tienes permisos para agregar una observación a esta acta.');
            }
            
            const participanteId = partRes.rows[0].id;
            
            await client.query(
                `UPDATE seguimiento_participante 
                 SET observacion = $1, observacion_at = NOW() 
                 WHERE id = $2`,
                [observacion.trim(), participanteId]
            );

            await client.query(
                `INSERT INTO seguimiento_historial (acta_id, accion, estado_anterior, estado_nuevo, actor_email, actor_role) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, 'agregar_observacion_consultor', acta.estado, acta.estado, email || cedula, 'consultor']
            );

            await client.query('COMMIT');
            return { ok: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    return {
        listActasConsultor,
        getActaConsultor,
        addObservacionConsultor
    };
}

module.exports = { createSeguimientoConsultorService };
