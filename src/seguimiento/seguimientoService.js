const { buildSeguimientoCierreEvent, buildSeguimientoVencimientoEvent } = require('../notifications/seguimientoEmailEvents');

function addDaysBogotaDate(baseDate, days) {
    const d = baseDate instanceof Date ? new Date(baseDate.getTime()) : new Date(String(baseDate));
    // Trabajar en calendario local Colombia (UTC-5 fijo para MVP)
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

function createSeguimientoService({
    pool,
    emailNotificationsPublisher,
    listEmailsInGroups
}) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('createSeguimientoService: pool es obligatorio.');
    }

    async function insertHistorial(client, { actaId, accion, actor, diff }) {
        await client.query(
            `INSERT INTO seguimiento_historial
               (acta_id, accion, actor_user_id, actor_email, actor_role, diff_json)
             VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::jsonb)`,
            [
                actaId,
                accion,
                actor?.userId || null,
                actor?.email || null,
                actor?.role || null,
                diff ? JSON.stringify(diff) : null
            ]
        );
    }

    async function replaceParticipantes(client, actaId, participantes) {
        await client.query('DELETE FROM seguimiento_participante WHERE acta_id = $1::uuid', [actaId]);
        for (const p of participantes || []) {
            await client.query(
                `INSERT INTO seguimiento_participante (acta_id, rol, cedula, email, nombre)
                 VALUES ($1::uuid, $2, $3, $4, $5)`,
                [
                    actaId,
                    p.rol,
                    p.cedula || null,
                    p.email ? String(p.email).trim().toLowerCase() : null,
                    p.nombre || null
                ]
            );
        }
    }

    async function loadParticipantes(actaId, client = pool) {
        const { rows } = await client.query(
            `SELECT id, rol, cedula, email, nombre
             FROM seguimiento_participante
             WHERE acta_id = $1::uuid
             ORDER BY rol, nombre NULLS LAST`,
            [actaId]
        );
        return rows;
    }

    async function getActaById(actaId, { includeDeleted = false } = {}) {
        const { rows } = await pool.query(
            `SELECT *
             FROM seguimiento_acta
             WHERE id = $1::uuid
               ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
             LIMIT 1`,
            [actaId]
        );
        const acta = rows[0] || null;
        if (!acta) return null;
        acta.participantes = await loadParticipantes(actaId);
        return acta;
    }

    async function resolveConsultorParticipantes(cedulas) {
        const list = Array.isArray(cedulas) ? cedulas.map((c) => String(c || '').trim()).filter(Boolean) : [];
        if (list.length === 0) return [];
        const { rows } = await pool.query(
            `SELECT cedula, nombre, correo_cinte AS email
             FROM colaboradores
             WHERE cedula = ANY($1::text[])`,
            [list]
        );
        const byCed = new Map(rows.map((r) => [String(r.cedula), r]));
        return list.map((cedula) => {
            const row = byCed.get(cedula) || {};
            return {
                rol: 'consultor',
                cedula,
                email: row.email ? String(row.email).trim().toLowerCase() : null,
                nombre: row.nombre || null
            };
        });
    }

    async function resolveLiderParticipantes(clienteNombre) {
        const cliente = String(clienteNombre || '').trim();
        if (!cliente) return [];
        // Líderes del cliente vía catálogo; email desde colaborador homónimo (no email del GP).
        const { rows: liderRows } = await pool.query(
            `SELECT cl.lider AS nombre, col.correo_cinte AS email
             FROM clientes_lideres cl
             LEFT JOIN colaboradores col
               ON lower(btrim(col.nombre)) = lower(btrim(cl.lider))
              AND col.activo IS DISTINCT FROM FALSE
             WHERE cl.activo = TRUE
               AND lower(btrim(cl.cliente)) = lower(btrim($1))`,
            [cliente]
        );
        const out = [];
        const seen = new Set();
        for (const r of liderRows) {
            const nombre = String(r.nombre || '').trim();
            const email = r.email ? String(r.email).trim().toLowerCase() : null;
            const key = `${nombre}|${email || ''}`;
            if (!nombre || seen.has(key)) continue;
            seen.add(key);
            out.push({ rol: 'lider', cedula: null, email, nombre });
        }
        return out;
    }

    function validatePayloadForFinalize(tipo, payload, participantes) {
        const p = payload && typeof payload === 'object' ? payload : {};
        if (!String(p.modalidad || '').trim()) return 'modalidad es obligatoria';
        if (!String(p.temasTratados || '').trim()) return 'temasTratados es obligatorio';
        if (!String(p.feedback || '').trim()) return 'feedback es obligatorio';
        const compromisos = Array.isArray(p.compromisos) ? p.compromisos : [];
        if (compromisos.length < 1) return 'al menos un compromiso es obligatorio';
        if (tipo === 'consultor') {
            const consultores = (participantes || []).filter((x) => x.rol === 'consultor');
            if (consultores.length < 1) return 'tipo consultor requiere al menos un consultor';
        }
        return null;
    }

    function mapActaRow(row, participantes = []) {
        if (!row) return null;
        const ciclo = row.ciclo_vence_at ? String(row.ciclo_vence_at).slice(0, 10) : null;
        return {
            id: row.id,
            tipo: row.tipo,
            estado: row.estado,
            clienteNombre: row.cliente_nombre,
            gpUserId: row.gp_user_id,
            creadoPorUserId: row.creado_por_user_id,
            creadoPorEmail: row.creado_por_email,
            fechaSeguimiento: row.fecha_seguimiento ? String(row.fecha_seguimiento).slice(0, 10) : null,
            payload: row.payload_json || {},
            finalizadoAt: row.finalizado_at,
            correoCierreEstado: row.correo_cierre_estado,
            correosCierreEnviadosAt: row.correos_cierre_enviados_at,
            correoCierreLastError: row.correo_cierre_last_error,
            cicloVenceAt: ciclo,
            diasRestantes: ciclo ? daysUntil(ciclo) : null,
            reminderT5SentAt: row.reminder_t5_sent_at,
            reminderT1SentAt: row.reminder_t1_sent_at,
            deletedAt: row.deleted_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            participantes
        };
    }

    async function listActas({
        gpUserId = null,
        tipo = null,
        estado = null,
        cliente = null,
        proximosVencer = false,
        maxDias = 5
    } = {}) {
        const params = [];
        const where = ['deleted_at IS NULL'];
        if (gpUserId) {
            params.push(gpUserId);
            where.push(`gp_user_id = $${params.length}::uuid`);
        }
        if (tipo) {
            params.push(tipo);
            where.push(`tipo = $${params.length}`);
        }
        if (estado) {
            params.push(estado);
            where.push(`estado = $${params.length}`);
        }
        if (cliente) {
            params.push(cliente);
            where.push(`lower(btrim(cliente_nombre)) = lower(btrim($${params.length}))`);
        }
        if (proximosVencer) {
            where.push(`estado = 'finalizado'`);
            where.push(`correo_cierre_estado = 'enviado'`);
            where.push(`ciclo_vence_at IS NOT NULL`);
            params.push(Number(maxDias) || 5);
            where.push(
                `ciclo_vence_at::date BETWEEN (timezone('America/Bogota', now()))::date
                 AND ((timezone('America/Bogota', now()))::date + ($${params.length}::int))`
            );
        }
        const { rows } = await pool.query(
            `SELECT * FROM seguimiento_acta
             WHERE ${where.join(' AND ')}
             ORDER BY
               CASE WHEN ciclo_vence_at IS NULL THEN 1 ELSE 0 END,
               ciclo_vence_at ASC NULLS LAST,
               updated_at DESC
             LIMIT 500`,
            params
        );
        const out = [];
        for (const row of rows) {
            const parts = await loadParticipantes(row.id);
            out.push(mapActaRow(row, parts));
        }
        return out;
    }

    function cierreRecipientsFromActa(acta) {
        const rol = acta.tipo === 'consultor' ? 'consultor' : 'lider';
        const seen = new Set();
        const recipients = [];
        for (const p of acta.participantes || []) {
            if (p.rol !== rol) continue;
            const email = String(p.email || '').trim().toLowerCase();
            if (!email.includes('@') || seen.has(email)) continue;
            seen.add(email);
            recipients.push({ email, name: p.nombre || undefined });
        }
        return recipients;
    }

    function compromisosResumen(payload) {
        const list = Array.isArray(payload?.compromisos) ? payload.compromisos : [];
        return list
            .map((c) => String(c?.descripcion || '').trim())
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
            tipo: acta.tipo,
            recipients,
            realizadoPorNombre,
            acta: {
                fecha: String(acta.fecha_seguimiento || '').slice(0, 10),
                cliente: acta.cliente_nombre,
                modalidad: p.modalidad || '',
                temasTratados: p.temasTratados || p.agenda || '',
                feedback: p.feedback || p.objetivo || '',
                compromisosResumen: compromisosResumen(p)
            }
        });
        const pub = await emailNotificationsPublisher.publishSeguimientoCierre(event);
        return persistCorreoResult(acta.id, pub);
    }

    async function createOrUpdateActa(input, actor) {
        const tipo = String(input.tipo || '').trim();
        if (!['consultor', 'cliente'].includes(tipo)) {
            const err = new Error('tipo inválido');
            err.statusCode = 400;
            throw err;
        }
        const clienteNombre = String(input.clienteNombre || '').trim();
        const fechaSeguimiento = String(input.fechaSeguimiento || '').trim();
        if (!clienteNombre || !fechaSeguimiento) {
            const err = new Error('clienteNombre y fechaSeguimiento son obligatorios');
            err.statusCode = 400;
            throw err;
        }
        const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
        const confirmar = Boolean(input.confirmar);

        let participantes = Array.isArray(input.participantes) ? input.participantes : null;
        if (!participantes) {
            if (tipo === 'consultor') {
                participantes = await resolveConsultorParticipantes(input.consultorCedulas || []);
            } else {
                participantes = await resolveLiderParticipantes(clienteNombre);
            }
        }

        if (confirmar) {
            const v = validatePayloadForFinalize(tipo, payload, participantes);
            if (v) {
                const err = new Error(v);
                err.statusCode = 400;
                throw err;
            }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let actaId = input.id || null;
            if (actaId) {
                const existing = await getActaById(actaId);
                if (!existing) {
                    const err = new Error('Acta no encontrada');
                    err.statusCode = 404;
                    throw err;
                }
                if (existing.estado === 'finalizado' && !['cac', 'super_admin'].includes(String(actor?.role || ''))) {
                    const err = new Error('GP no puede editar actas finalizadas');
                    err.statusCode = 403;
                    throw err;
                }
                await client.query(
                    `UPDATE seguimiento_acta
                     SET tipo = $2,
                         cliente_nombre = $3,
                         fecha_seguimiento = $4::date,
                         payload_json = $5::jsonb,
                         gp_user_id = COALESCE($6::uuid, gp_user_id),
                         estado = CASE WHEN $7 THEN 'finalizado' ELSE estado END,
                         finalizado_at = CASE WHEN $7 AND finalizado_at IS NULL THEN NOW() ELSE finalizado_at END,
                         updated_at = NOW()
                     WHERE id = $1::uuid`,
                    [
                        actaId,
                        tipo,
                        clienteNombre,
                        fechaSeguimiento,
                        JSON.stringify(payload),
                        actor?.userId || null,
                        confirmar
                    ]
                );
                await replaceParticipantes(client, actaId, participantes);
                await insertHistorial(client, {
                    actaId,
                    accion: confirmar ? 'finalizar' : 'actualizar',
                    actor,
                    diff: { confirmar }
                });
            } else {
                const { rows } = await client.query(
                    `INSERT INTO seguimiento_acta (
                        tipo, estado, cliente_nombre, gp_user_id, creado_por_user_id, creado_por_email,
                        fecha_seguimiento, payload_json, finalizado_at
                     ) VALUES (
                        $1, $2, $3, $4::uuid, $5::uuid, $6, $7::date, $8::jsonb,
                        CASE WHEN $9 THEN NOW() ELSE NULL END
                     ) RETURNING id`,
                    [
                        tipo,
                        confirmar ? 'finalizado' : 'borrador',
                        clienteNombre,
                        actor?.userId || null,
                        actor?.userId || null,
                        actor?.email || null,
                        fechaSeguimiento,
                        JSON.stringify(payload),
                        confirmar
                    ]
                );
                actaId = rows[0].id;
                await replaceParticipantes(client, actaId, participantes);
                await insertHistorial(client, {
                    actaId,
                    accion: confirmar ? 'finalizar' : 'crear',
                    actor,
                    diff: { confirmar }
                });
            }
            await client.query('COMMIT');

            let correoMeta = null;
            if (confirmar) {
                const acta = await getActaById(actaId);
                correoMeta = await publishCierreForActa(acta);
            }
            const fresh = await getActaById(actaId);
            return { acta: mapActaRow(fresh, fresh.participantes), correo: correoMeta };
        } catch (e) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {
                /* ignore */
            }
            throw e;
        } finally {
            client.release();
        }
    }

    async function reintentarCorreo(actaId, actor) {
        const acta = await getActaById(actaId);
        if (!acta) {
            const err = new Error('Acta no encontrada');
            err.statusCode = 404;
            throw err;
        }
        if (acta.estado !== 'finalizado') {
            const err = new Error('Solo actas finalizadas pueden reintentar correo');
            err.statusCode = 409;
            throw err;
        }
        if (acta.correo_cierre_estado === 'enviado') {
            const err = new Error('El correo de cierre ya fue enviado');
            err.statusCode = 409;
            throw err;
        }
        const role = String(actor?.role || '');
        if (role === 'gp' && String(acta.gp_user_id || '') !== String(actor?.userId || '')) {
            const err = new Error('GP solo puede reintentar sus actas');
            err.statusCode = 403;
            throw err;
        }
        const correo = await publishCierreForActa(acta);
        await pool.query(
            `INSERT INTO seguimiento_historial
               (acta_id, accion, actor_user_id, actor_email, actor_role, diff_json)
             VALUES ($1::uuid, 'reintentar_correo', $2::uuid, $3, $4, $5::jsonb)`,
            [
                actaId,
                actor?.userId || null,
                actor?.email || null,
                actor?.role || null,
                JSON.stringify(correo)
            ]
        );
        const fresh = await getActaById(actaId);
        return { acta: mapActaRow(fresh, fresh.participantes), correo };
    }

    async function softDeleteActa(actaId, actor) {
        const role = String(actor?.role || '');
        if (!['cac', 'super_admin'].includes(role)) {
            const err = new Error('Sin permiso para eliminar');
            err.statusCode = 403;
            throw err;
        }
        const { rowCount } = await pool.query(
            `UPDATE seguimiento_acta
             SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1::uuid AND deleted_at IS NULL`,
            [actaId]
        );
        if (!rowCount) {
            const err = new Error('Acta no encontrada');
            err.statusCode = 404;
            throw err;
        }
        await pool.query(
            `INSERT INTO seguimiento_historial
               (acta_id, accion, actor_user_id, actor_email, actor_role)
             VALUES ($1::uuid, 'eliminar', $2::uuid, $3, $4)`,
            [actaId, actor?.userId || null, actor?.email || null, actor?.role || null]
        );
        return { ok: true };
    }

    /** Elegibles T-5 / T-1 para selector AWS (días exactos). */
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
            `SELECT id, tipo, cliente_nombre, gp_user_id, ciclo_vence_at
             FROM seguimiento_acta
             WHERE deleted_at IS NULL
               AND estado = 'finalizado'
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
            sujetoLabel: r.cliente_nombre,
            gpUserId: r.gp_user_id
        }));
    }

    async function resolveReminderRecipients(actaRow) {
        const recipients = [];
        const seen = new Set();
        if (actaRow.gp_user_id) {
            const { rows } = await pool.query(
                `SELECT email FROM users WHERE id = $1::uuid LIMIT 1`,
                [actaRow.gp_user_id]
            );
            const email = String(rows[0]?.email || '')
                .trim()
                .toLowerCase();
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
                    const email = String(e || '')
                        .trim()
                        .toLowerCase();
                    if (!email.includes('@') || seen.has(email)) continue;
                    seen.add(email);
                    recipients.push({ email, role: 'staff' });
                }
            } catch (e) {
                console.warn('[seguimiento] listEmailsInGroups falló:', e?.message || e);
            }
        }
        return recipients;
    }

    async function processReminderMessage({ seguimientoId, kind }) {
        const k = String(kind || '').toUpperCase();
        const acta = await getActaById(seguimientoId);
        if (!acta) return { ok: false, reason: 'not_found' };
        if (acta.estado !== 'finalizado' || acta.correo_cierre_estado !== 'enviado' || !acta.ciclo_vence_at) {
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
            tipo: acta.tipo,
            sujetoLabel: acta.cliente_nombre
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
        getActaById: async (id) => {
            const a = await getActaById(id);
            return a ? mapActaRow(a, a.participantes) : null;
        },
        listActas,
        createOrUpdateActa,
        reintentarCorreo,
        softDeleteActa,
        listElegiblesRecordatorio,
        processReminderMessage,
        todayBogotaDate,
        daysUntil
    };
}

module.exports = {
    createSeguimientoService,
    addDaysBogotaDate,
    todayBogotaDate,
    daysUntil
};
