const { buildSeguimientoCierreEvent, buildSeguimientoVencimientoEvent } = require('../notifications/seguimientoEmailEvents');

function addDaysBogotaDate(baseDate, days) {
    const d = baseDate instanceof Date ? new Date(baseDate.getTime()) : new Date(String(baseDate));
    const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const next = new Date(utc + Number(days) * 86400000);
    return next.toISOString().slice(0, 10);
}

function todayBogotaDate() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return fmt.format(new Date());
}

function daysUntil(dateYmd, fromYmd = todayBogotaDate()) {
    const a = new Date(`${fromYmd}T12:00:00Z`).getTime();
    const b = new Date(`${dateYmd}T12:00:00Z`).getTime();
    return Math.round((b - a) / 86400000);
}

function normalizeTipo(tipo) {
    return String(tipo || '').trim().toLowerCase();
}

function createSeguimientoService({ pool, emailNotificationsPublisher, listEmailsInGroups } = {}) {
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
    async function listActas({
        gpId = null,
        clientesAsignados = null,
        limit = 50,
        offset = 0,
        proximosVencer = false,
        maxDias = 5
    } = {}) {
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

        if (proximosVencer) {
            whereClause += ` AND UPPER(a.estado) = 'FINALIZADO'`;
            whereClause += ` AND a.correo_cierre_estado = 'enviado'`;
            whereClause += ` AND a.ciclo_vence_at IS NOT NULL`;
            queryParams.push(Number(maxDias) || 5);
            whereClause += ` AND a.ciclo_vence_at::date BETWEEN (timezone('America/Bogota', now()))::date
                 AND ((timezone('America/Bogota', now()))::date + ($${queryParams.length}::int))`;
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
                a.ciclo_vence_at,
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
        return (rows || []).map((row) => {
            const ciclo = row.ciclo_vence_at ? String(row.ciclo_vence_at).slice(0, 10) : null;
            return {
                ...row,
                diasRestantes: ciclo ? daysUntil(ciclo) : null
            };
        });
    }

    function validateFinalizadoActa(data) {
        if (!data.fecha_acta) throw new Error('Fecha de acta es obligatoria para finalizar.');
        const hInicio = data.payload_json?.hora_inicio || '';
        const hFin = data.payload_json?.hora_fin || '';
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (!timeRegex.test(hInicio)) throw new Error('El formato de Hora de inicio no es válido (usa formato 24h, ej. 08:30).');
        if (!timeRegex.test(hFin)) throw new Error('El formato de Hora de fin no es válido (usa formato 24h, ej. 14:00).');
        
        if (!data.payload_json?.objetivo?.trim()) throw new Error('El objetivo de la sesión es obligatorio.');
        if (!data.payload_json?.agenda?.trim()) throw new Error('La agenda desarrollada es obligatoria.');
        if (!data.payload_json?.planes_accion || data.payload_json.planes_accion.length === 0) throw new Error('Debe agregar al menos un plan de acción para finalizar.');
        if (!data.participantes || data.participantes.length === 0) throw new Error('Debe agregar al menos un participante.');
    }

    async function createActa(data, actor) {
        const { gp_id, cliente, tipo, fecha_acta, estado, compromisos, observaciones, payload_json, participantes } = data;
        
        if (estado === 'FINALIZADO') {
            validateFinalizadoActa(data);
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
            if (estado === 'FINALIZADO') {
                const acta = await getActa(actaId, null);
                await publishCierreForActa(acta);
            }
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
            validateFinalizadoActa(data);
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
            if (isNowFinalizado) {
                const acta = await getActa(id, null);
                await publishCierreForActa(acta);
            }
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

    function cierreRecipientsFromActa(acta) {
        const seen = new Set();
        const recipients = [];
        for (const p of acta?.participantes || []) {
            const email = String(p.email || '').trim().toLowerCase();
            if (!email.includes('@') || seen.has(email)) continue;
            seen.add(email);
            recipients.push({ email, name: p.nombre || undefined });
        }
        return recipients;
    }

    function compromisosResumen(payload) {
        const list = Array.isArray(payload?.planes_accion)
            ? payload.planes_accion
            : Array.isArray(payload?.compromisos)
                ? payload.compromisos
                : [];
        return list
            .map((c) => String(c?.descripcion || c?.tarea || '').trim())
            .filter(Boolean)
            .slice(0, 8)
            .join('; ');
    }

    async function persistCorreoResult(actaId, result) {
        if (result?.accepted) {
            const ciclo = addDaysBogotaDate(new Date(), 30);
            await pool.query(
                `UPDATE seguimiento_acta
                 SET correo_cierre_estado = 'enviado',
                     correos_cierre_enviados_at = NOW(),
                     correo_cierre_last_error = NULL,
                     ciclo_vence_at = $2::date,
                     updated_at = NOW()
                 WHERE id = $1::uuid`,
                [actaId, ciclo]
            );
            return { correoCierreEstado: 'enviado', cicloVenceAt: ciclo };
        }
        const estado = result?.skipped && result?.reason === 'disabled' ? 'pendiente' : 'fallido';
        const err =
            result?.error ||
            result?.reason ||
            (result?.skipped ? `skipped:${result.reason}` : 'publish_failed');
        await pool.query(
            `UPDATE seguimiento_acta
             SET correo_cierre_estado = $2,
                 correos_cierre_enviados_at = NULL,
                 correo_cierre_last_error = $3,
                 ciclo_vence_at = NULL,
                 updated_at = NOW()
             WHERE id = $1::uuid`,
            [actaId, estado, String(err).slice(0, 1000)]
        );
        return { correoCierreEstado: estado, cicloVenceAt: null, error: err };
    }

    async function publishCierreForActa(acta) {
        if (!acta?.id) {
            return { correoCierreEstado: 'fallido', cicloVenceAt: null, error: 'acta_missing' };
        }
        const recipients = cierreRecipientsFromActa(acta);
        if (recipients.length === 0) {
            return persistCorreoResult(acta.id, {
                accepted: false,
                skipped: true,
                reason: 'no_recipients'
            });
        }
        if (!emailNotificationsPublisher?.publishSeguimientoCierre) {
            return persistCorreoResult(acta.id, {
                accepted: false,
                skipped: true,
                reason: 'publisher_missing'
            });
        }
        const p = acta.payload_json || {};
        const realizadoPorNombre =
            String(p.responsable_nombre || p.responsableNombre || '').trim() ||
            String(p.quien_realiza_nombre || p.quienRealizaNombre || '').trim() ||
            '';
        const event = buildSeguimientoCierreEvent({
            seguimientoId: acta.id,
            tipo: normalizeTipo(acta.tipo) === 'cliente' ? 'cliente' : 'consultor',
            recipients,
            realizadoPorNombre,
            acta: {
                fecha: String(acta.fecha_acta || '').slice(0, 10),
                cliente: acta.cliente,
                modalidad: p.modalidad || '',
                temasTratados: p.agenda || p.temasTratados || '',
                feedback: p.objetivo || p.feedback || '',
                compromisosResumen: compromisosResumen(p)
            }
        });
        const pub = await emailNotificationsPublisher.publishSeguimientoCierre(event);
        return persistCorreoResult(acta.id, pub);
    }

    async function reintentarCorreoCierre(id, actor) {
        const acta = await getActa(id, null);
        if (!acta) {
            const err = new Error('Acta no encontrada');
            err.statusCode = 404;
            throw err;
        }
        if (String(acta.estado || '').toUpperCase() !== 'FINALIZADO') {
            const err = new Error('Solo actas finalizadas pueden reintentar correo');
            err.statusCode = 409;
            throw err;
        }
        if (acta.correo_cierre_estado === 'enviado') {
            const err = new Error('El correo de cierre ya fue enviado');
            err.statusCode = 409;
            throw err;
        }
        const role = String(actor?.role || '').toLowerCase();
        if (role === 'gp' && String(acta.gp_id || '') !== String(actor?.id || '')) {
            const err = new Error('GP solo puede reintentar sus actas');
            err.statusCode = 403;
            throw err;
        }
        const correo = await publishCierreForActa(acta);
        await pool.query(
            `INSERT INTO seguimiento_historial (acta_id, accion, estado_anterior, estado_nuevo, actor_user_id, actor_email, actor_role, detalle)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
            [id, 'reintentar_correo', 'FINALIZADO', 'FINALIZADO', actor?.id || null, actor?.email || null, actor?.role || null, JSON.stringify(correo)]
        );
        return correo;
    }

    async function listElegiblesRecordatorio({ kind, asOfDate = todayBogotaDate() } = {}) {
        const k = String(kind || '').toUpperCase();
        if (!['T5', 'T1'].includes(k)) {
            const err = new Error('kind debe ser T5 o T1');
            err.statusCode = 400;
            throw err;
        }
        const dias = k === 'T5' ? 5 : 1;
        const flagCol = k === 'T5' ? 'reminder_t5_sent_at' : 'reminder_t1_sent_at';
        const { rows } = await pool.query(
            `SELECT id, tipo, cliente, gp_id, ciclo_vence_at
             FROM seguimiento_acta
             WHERE deleted_at IS NULL
               AND UPPER(estado) = 'FINALIZADO'
               AND correo_cierre_estado = 'enviado'
               AND ciclo_vence_at IS NOT NULL
               AND ${flagCol} IS NULL
               AND ciclo_vence_at::date = ($1::date + $2::int)`,
            [asOfDate, dias]
        );
        return rows.map((r) => ({
            seguimientoId: r.id,
            kind: k,
            cicloVenceAt: String(r.ciclo_vence_at).slice(0, 10),
            tipo: r.tipo,
            sujetoLabel: r.cliente,
            gpUserId: r.gp_id
        }));
    }

    async function resolveReminderRecipients(actaRow) {
        const recipients = [];
        const seen = new Set();
        if (actaRow.gp_id) {
            const { rows } = await pool.query(
                `SELECT email FROM users WHERE id = $1::uuid LIMIT 1`,
                [actaRow.gp_id]
            );
            const email = String(rows[0]?.email || '').trim().toLowerCase();
            if (email.includes('@') && !seen.has(email)) {
                seen.add(email);
                recipients.push({ email, role: 'gp' });
            }
        }
        if (typeof listEmailsInGroups === 'function') {
            try {
                const res = await listEmailsInGroups(['super_admin', 'cac']);
                const emails = Array.isArray(res?.emails) ? res.emails : Array.isArray(res) ? res : [];
                for (const e of emails) {
                    const email = String(e || '').trim().toLowerCase();
                    if (!email.includes('@') || seen.has(email)) continue;
                    seen.add(email);
                    recipients.push({ email, role: 'staff' });
                }
            } catch (e) {
                console.warn('[Seguimiento] listEmailsInGroups falló:', e?.message || e);
            }
        }
        return recipients;
    }

    async function processReminderMessage({ seguimientoId, kind }) {
        const k = String(kind || '').toUpperCase();
        const acta = await getActa(seguimientoId, null);
        if (!acta) return { ok: false, reason: 'not_found' };
        if (String(acta.estado || '').toUpperCase() !== 'FINALIZADO' || acta.correo_cierre_estado !== 'enviado' || !acta.ciclo_vence_at) {
            return { ok: false, reason: 'not_eligible' };
        }
        const flagCol = k === 'T5' ? 'reminder_t5_sent_at' : 'reminder_t1_sent_at';
        if (acta[flagCol]) return { ok: true, skipped: true, reason: 'already_sent' };

        const dias = daysUntil(String(acta.ciclo_vence_at).slice(0, 10));
        const expected = k === 'T5' ? 5 : 1;
        if (dias !== expected) return { ok: false, reason: 'day_mismatch', dias };

        const recipients = await resolveReminderRecipients(acta);
        if (recipients.length === 0) return { ok: false, reason: 'no_recipients' };

        if (!emailNotificationsPublisher?.publishSeguimientoVencimiento) {
            return { ok: false, reason: 'publisher_missing' };
        }
        const event = buildSeguimientoVencimientoEvent({
            seguimientoId: acta.id,
            kind: k,
            recipients,
            venceEl: String(acta.ciclo_vence_at).slice(0, 10),
            tipo: normalizeTipo(acta.tipo) === 'cliente' ? 'cliente' : 'consultor',
            sujetoLabel: acta.cliente
        });
        const pub = await emailNotificationsPublisher.publishSeguimientoVencimiento(event);
        if (!pub?.accepted) {
            return { ok: false, reason: pub?.reason || pub?.error || 'publish_failed', pub };
        }
        await pool.query(
            `UPDATE seguimiento_acta
             SET ${flagCol} = NOW(), updated_at = NOW()
             WHERE id = $1::uuid AND ${flagCol} IS NULL`,
            [seguimientoId]
        );
        return { ok: true, kind: k, recipients: recipients.length };
    }

    return {
        listActas,
        getActa,
        createActa,
        updateActa,
        softDeleteActa,
        addObservacionConsultor,
        getInternalUserIdByEmail,
        reintentarCorreoCierre,
        reintentarCorreo: reintentarCorreoCierre,
        listElegiblesRecordatorio,
        processReminderMessage
    };
}

module.exports = {
    createSeguimientoService,
    addDaysBogotaDate,
    todayBogotaDate,
    daysUntil
};
