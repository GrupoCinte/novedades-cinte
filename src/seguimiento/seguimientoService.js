function createSeguimientoService({ pool }) {
    if (!pool) {
        throw new TypeError('createSeguimientoService: pool es obligatorio');
    }

    /**
     * Lista las actas de seguimiento.
     * Si se provee `gpId`, filtra para traer solo actas asociadas a la cartera de ese GP.
     * Si `gpId` es null/undefined, trae todas las actas (ej. para CAC o Super Admin).
     *
     * IMPORTANTE: Esta función es de solo lectura (AUT-283).
     * Las funciones de escritura se implementarán en AUT-284.
     */
    async function listActas({ gpId = null, clientesAsignados = null, limit = 50, offset = 0 } = {}) {
        const queryParams = [];
        let whereClause = "WHERE a.deleted_at IS NULL";

        if (clientesAsignados !== null) {
            if (clientesAsignados.length === 0) {
                return []; // GP with no clients gets no actas
            }
            queryParams.push(clientesAsignados);
            whereClause += ` AND a.cliente = ANY($${queryParams.length})`;
        } else if (gpId) {
            // Fallback just in case, though we'll use clientesAsignados mostly
            queryParams.push(gpId);
            whereClause += ` AND a.gp_id = $${queryParams.length}::uuid`;
        }

        queryParams.push(limit);
        const limitIndex = queryParams.length;
        
        queryParams.push(offset);
        const offsetIndex = queryParams.length;

        const sql = `
            SELECT 
                a.id,
                a.gp_id,
                a.cliente,
                a.tipo,
                a.fecha_acta,
                a.estado,
                a.correo_cierre_estado,
                a.payload_json,
                a.created_at,
                a.updated_at,
                (
                    SELECT json_agg(json_build_object('nombre', p.nombre, 'rol', p.rol, 'cedula', p.cedula, 'email', p.email))
                    FROM seguimiento_participante p
                    WHERE p.acta_id = a.id
                ) as participantes
            FROM seguimiento_acta a
            ${whereClause}
            ORDER BY a.fecha_acta DESC, a.created_at DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `;

        const { rows } = await pool.query(sql, queryParams);
        return rows || [];
    }

    async function createActa(data, actor) {
        const { gp_id, cliente, tipo, fecha_acta, estado, compromisos, observaciones, payload_json, participantes } = data;
        
        if (estado === 'FINALIZADO') {
            if (!fecha_acta) throw new Error('Fecha de acta es obligatoria para finalizar.');
            const hInicio = payload_json?.hora_inicio || '';
            const hFin = payload_json?.hora_fin || '';
            const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
            if (!timeRegex.test(hInicio)) throw new Error('El formato de Hora de inicio no es válido (usa formato 24h, ej. 08:30).');
            if (!timeRegex.test(hFin)) throw new Error('El formato de Hora de fin no es válido (usa formato 24h, ej. 14:00).');
            
            if (!payload_json?.objetivo?.trim()) throw new Error('El objetivo de la sesión es obligatorio.');
            if (!payload_json?.agenda?.trim()) throw new Error('La agenda desarrollada es obligatoria.');
            if (!payload_json?.planes_accion || payload_json.planes_accion.length === 0) throw new Error('Debe agregar al menos un plan de acción para finalizar.');
            if (!participantes || participantes.length === 0) throw new Error('Debe agregar al menos un participante.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const insertActa = `
                INSERT INTO seguimiento_acta 
                (gp_id, cliente, tipo, fecha_acta, estado, compromisos, observaciones, payload_json, finalizado_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `;
            const finalizadoAt = estado === 'FINALIZADO' ? new Date() : null;
            const resActa = await client.query(insertActa, [gp_id, cliente, tipo, fecha_acta, estado, compromisos, observaciones, payload_json, finalizadoAt]);
            const actaId = resActa.rows[0].id;

            if (participantes && Array.isArray(participantes)) {
                for (const p of participantes) {
                    await client.query(
                        `INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email) VALUES ($1, $2, $3, $4, $5)`,
                        [actaId, p.nombre, p.rol, p.cedula, p.email]
                    );
                }
            }

            await client.query(
                `INSERT INTO seguimiento_historial (acta_id, accion, estado_nuevo, actor_user_id, actor_email, actor_role) VALUES ($1, $2, $3, $4, $5, $6)`,
                [actaId, 'crear', estado, actor.id, actor.email, actor.role]
            );

            await client.query('COMMIT');
            return { id: actaId };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async function updateActa(id, data, actor) {
        const { cliente, tipo, fecha_acta, estado, compromisos, observaciones, payload_json, participantes } = data;
        
        if (estado === 'FINALIZADO') {
            if (!fecha_acta) throw new Error('Fecha de acta es obligatoria para finalizar.');
            const hInicio = payload_json?.hora_inicio || '';
            const hFin = payload_json?.hora_fin || '';
            const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
            if (!timeRegex.test(hInicio)) throw new Error('El formato de Hora de inicio no es válido (usa formato 24h, ej. 08:30).');
            if (!timeRegex.test(hFin)) throw new Error('El formato de Hora de fin no es válido (usa formato 24h, ej. 14:00).');
            
            if (!payload_json?.objetivo?.trim()) throw new Error('El objetivo de la sesión es obligatorio.');
            if (!payload_json?.agenda?.trim()) throw new Error('La agenda desarrollada es obligatoria.');
            if (!payload_json?.planes_accion || payload_json.planes_accion.length === 0) throw new Error('Debe agregar al menos un plan de acción para finalizar.');
            if (!participantes || participantes.length === 0) throw new Error('Debe agregar al menos un participante.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const currentRes = await client.query('SELECT estado FROM seguimiento_acta WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
            if (currentRes.rows.length === 0) throw new Error('Acta no encontrada o eliminada');
            const estadoAnterior = currentRes.rows[0].estado;

            if (estadoAnterior === 'FINALIZADO') {
                const r = String(actor.role).toLowerCase();
                if (r !== 'cac' && r !== 'super_admin') {
                    throw new Error('El acta ya se encuentra finalizada y no puede ser modificada por tu rol');
                }
            }

            const isNowFinalizado = estadoAnterior !== 'FINALIZADO' && estado === 'FINALIZADO';
            const updateSql = `
                UPDATE seguimiento_acta 
                SET cliente = $1, tipo = $2, fecha_acta = $3, estado = $4, compromisos = $5, observaciones = $6, payload_json = $7, updated_at = NOW()
                ${isNowFinalizado ? ', finalizado_at = NOW()' : ''}
                WHERE id = $8
            `;
            const params = [cliente, tipo, fecha_acta, estado, compromisos, observaciones, payload_json, id];

            await client.query(updateSql, params);

            if (participantes && Array.isArray(participantes)) {
                await client.query('DELETE FROM seguimiento_participante WHERE acta_id = $1', [id]);
                for (const p of participantes) {
                    await client.query(
                        `INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email) VALUES ($1, $2, $3, $4, $5)`,
                        [id, p.nombre, p.rol, p.cedula, p.email]
                    );
                }
            }

            await client.query(
                `INSERT INTO seguimiento_historial (acta_id, accion, estado_anterior, estado_nuevo, actor_user_id, actor_email, actor_role) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, estadoAnterior === estado ? 'actualizar' : 'finalizar', estadoAnterior, estado, actor.id, actor.email, actor.role]
            );

            await client.query('COMMIT');
            return { id };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async function softDeleteActa(id, actor) {
        if (String(actor.role).toLowerCase() !== 'cac' && String(actor.role).toLowerCase() !== 'super_admin') {
            throw new Error('Solo CAC o Super Admin pueden eliminar un acta');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const currentRes = await client.query('SELECT estado FROM seguimiento_acta WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
            if (currentRes.rows.length === 0) throw new Error('Acta no encontrada o ya eliminada');
            const estadoAnterior = currentRes.rows[0].estado;

            await client.query('UPDATE seguimiento_acta SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
            
            await client.query(
                `INSERT INTO seguimiento_historial (acta_id, accion, estado_anterior, actor_user_id, actor_email, actor_role) VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, 'eliminar', estadoAnterior, actor.id, actor.email, actor.role]
            );

            await client.query('COMMIT');
            return { id };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async function getActa(id, clientesAsignados = null) {
        const queryParams = [id];
        let whereClause = "WHERE a.id = $1 AND a.deleted_at IS NULL";
        
        if (clientesAsignados !== null) {
            if (clientesAsignados.length === 0) {
                return null;
            }
            queryParams.push(clientesAsignados);
            whereClause += ` AND a.cliente = ANY($${queryParams.length})`;
        }

        const sql = `
            SELECT 
                a.*,
                (
                    SELECT json_agg(json_build_object('nombre', p.nombre, 'rol', p.rol, 'cedula', p.cedula, 'email', p.email))
                    FROM seguimiento_participante p
                    WHERE p.acta_id = a.id
                ) as participantes
            FROM seguimiento_acta a
            ${whereClause}
        `;
        const { rows } = await pool.query(sql, queryParams);
        return rows[0] || null;
    }

    async function addObservacionConsultor(id, observacion, actor) {
        // actor is expected to be a consultant
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const currentRes = await client.query('SELECT estado, finalizado_at, payload_json FROM seguimiento_acta WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
            if (currentRes.rows.length === 0) throw new Error('Acta no encontrada');
            const row = currentRes.rows[0];

            if (row.estado !== 'FINALIZADO' || !row.finalizado_at) {
                throw new Error('Solo se pueden agregar observaciones a actas finalizadas');
            }

            // Calculate diff in days
            const finalizadoDate = new Date(row.finalizado_at);
            const now = new Date();
            const diffTime = Math.abs(now - finalizadoDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (diffDays > 3) {
                throw new Error('El plazo de 3 días calendario para agregar observaciones ha expirado');
            }

            const payloadJson = row.payload_json || {};
            payloadJson.observacion_consultor = observacion;
            payloadJson.observacion_consultor_fecha = now.toISOString();
            payloadJson.observacion_consultor_actor = actor.email;

            await client.query(
                'UPDATE seguimiento_acta SET payload_json = $1, updated_at = NOW() WHERE id = $2',
                [payloadJson, id]
            );

            await client.query(
                `INSERT INTO seguimiento_historial (acta_id, accion, estado_anterior, estado_nuevo, actor_user_id, actor_email, actor_role) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, 'agregar_observacion_consultor', row.estado, row.estado, actor.id, actor.email, actor.role]
            );

            await client.query('COMMIT');
            return { id };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async function getInternalUserIdByEmail(email) {
        if (!email) return null;
        const res = await pool.query('SELECT id FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1', [email]);
        return res.rows[0]?.id || null;
    }

    async function reintentarCorreoCierre(id, actor) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Simula éxito del correo pendiente de envío
            const sql = `
                UPDATE seguimiento_acta 
                SET correo_cierre_estado = 'enviado',
                    updated_at = NOW()
                WHERE id = $1
                RETURNING correo_cierre_estado
            `;
            const { rows } = await client.query(sql, [id]);
            const newStatus = rows[0]?.correo_cierre_estado || 'pendiente';

            await client.query(
                `INSERT INTO seguimiento_historial (acta_id, accion, estado_anterior, estado_nuevo, actor_user_id, actor_email, actor_role) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, 'reintentar_correo', 'FINALIZADO', 'FINALIZADO', actor.id, actor.email, actor.role]
            );

            await client.query('COMMIT');
            return newStatus;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    return {
        listActas,
        getActa,
        createActa,
        updateActa,
        softDeleteActa,
        addObservacionConsultor,
        getInternalUserIdByEmail,
        reintentarCorreoCierre
    };
}

module.exports = {
    createSeguimientoService
};
