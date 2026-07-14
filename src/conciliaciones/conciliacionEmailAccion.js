'use strict';

const { createHash, randomBytes } = require('crypto');
const { getServicioCierreRow, normalizeEstadoServicio, CONCILIAR_SERVICIO_ROLES } = require('./conciliacionServicioCierre');

function resolveEmailActionTokenTtlMs() {
    const hoursRaw = process.env.CONCILIACION_EMAIL_TOKEN_TTL_HOURS;
    if (hoursRaw != null && String(hoursRaw).trim() !== '') {
        const hours = Number(hoursRaw);
        if (Number.isFinite(hours) && hours > 0) return hours * 60 * 60 * 1000;
    }
    const daysRaw = process.env.CONCILIACION_EMAIL_TOKEN_TTL_DAYS;
    if (daysRaw != null && String(daysRaw).trim() !== '') {
        const days = Number(daysRaw);
        if (Number.isFinite(days) && days > 0) return days * 24 * 60 * 60 * 1000;
    }
    return 72 * 60 * 60 * 1000;
}

function hashToken(raw) {
    return createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function buildActionUrl(frontendUrl, token, accion) {
    const base = String(frontendUrl || 'http://localhost:5175').trim().replace(/\/$/, '');
    return `${base}/conciliaciones/email-accion?token=${encodeURIComponent(token)}&accion=${accion}`;
}

function assertTokenRowValid(row, expectedAccion) {
    if (!row) {
        const error = new Error('Enlace no válido o expirado');
        error.status = 404;
        throw error;
    }
    if (row.usado_at) {
        const error = new Error('Este enlace ya fue utilizado');
        error.status = 410;
        throw error;
    }
    if (row.expira_at && new Date(row.expira_at).getTime() < Date.now()) {
        const error = new Error('El enlace ha expirado');
        error.status = 410;
        throw error;
    }
    if (expectedAccion && String(row.accion) !== String(expectedAccion)) {
        const error = new Error(
            expectedAccion === 'approve' ? 'Token no válido para aprobación' : 'Token no válido para rechazo'
        );
        error.status = 400;
        throw error;
    }
}

async function createEmailActionTokens(pool, { servicioId, anio, mes, recipientEmail, eventId }) {
    const expira = new Date(Date.now() + resolveEmailActionTokenTtlMs());
    const email = String(recipientEmail || '').trim().toLowerCase();
    const tokens = { approve: null, reject: null };

    for (const accion of ['approve', 'reject']) {
        const raw = randomBytes(32).toString('hex');
        tokens[accion] = raw;
        await pool.query(
            `INSERT INTO conciliaciones_email_acciones
                (token_hash, servicio_id, anio, mes, accion, recipient_email, event_id, expira_at)
             VALUES ($1, $2, $3::integer, $4::integer, $5, $6, $7, $8)`,
            [hashToken(raw), String(servicioId), Number(anio), Number(mes), accion, email, String(eventId || ''), expira]
        );
    }
    return tokens;
}

function attachActionUrlsToEvent(eventPayload, tokens, frontendUrl) {
    return {
        ...eventPayload,
        actions: {
            approveUrl: buildActionUrl(frontendUrl, tokens.approve, 'approve'),
            rejectUrl: buildActionUrl(frontendUrl, tokens.reject, 'reject')
        }
    };
}

async function resolveEmailActionToken(pool, rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) {
        const error = new Error('Token requerido');
        error.status = 400;
        throw error;
    }
    const q = await pool.query(
        `SELECT id, servicio_id, anio, mes, accion, recipient_email, usado_at, expira_at, observacion
         FROM conciliaciones_email_acciones
         WHERE token_hash = $1
         LIMIT 1`,
        [hashToken(token)]
    );
    const row = q.rows[0];
    assertTokenRowValid(row);
    return { row, rawToken: token };
}

async function lockEmailActionToken(client, rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) {
        const error = new Error('Token requerido');
        error.status = 400;
        throw error;
    }
    const q = await client.query(
        `SELECT id, servicio_id, anio, mes, accion, recipient_email, usado_at, expira_at, observacion
         FROM conciliaciones_email_acciones
         WHERE token_hash = $1
         FOR UPDATE`,
        [hashToken(token)]
    );
    return q.rows[0];
}

async function consumeEmailActionTokenLocked(client, rawToken, observacion = null) {
    const q = await client.query(
        `UPDATE conciliaciones_email_acciones
         SET usado_at = NOW(), observacion = COALESCE($2, observacion)
         WHERE token_hash = $1 AND usado_at IS NULL`,
        [hashToken(rawToken), observacion]
    );
    return q.rowCount || 0;
}

async function markConsultoresDevueltaPorLider(client, { cedulas, anio, mes, observacion, actorEmail, actorNombre }) {
    const obs = String(observacion || '').trim();
    const list = [...new Set((cedulas || []).map((c) => String(c || '').replace(/\D/g, '')).filter(Boolean))];
    if (!list.length) return 0;

    let updated = 0;
    for (const ced of list) {
        let rowQ = await client.query(
            `SELECT id, estado FROM conciliaciones_facturacion
             WHERE regexp_replace(cedula, '[^0-9]', '', 'g') = $1 AND anio = $2::integer AND mes = $3::integer
             FOR UPDATE`,
            [ced, Number(anio), Number(mes)]
        );
        let row = rowQ.rows[0];
        const estadoAnterior = row ? String(row.estado || 'PENDIENTE') : 'PENDIENTE';

        if (!row) {
            const ins = await client.query(
                `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, motivo_devolucion, fecha_cierre, updated_at)
                 VALUES ($1, $2::integer, $3::integer, 'DEVUELTA', $4, CURRENT_DATE, NOW())
                 RETURNING id, estado`,
                [ced, Number(anio), Number(mes), obs]
            );
            row = ins.rows[0];
        } else {
            await client.query(
                `UPDATE conciliaciones_facturacion
                 SET estado = 'DEVUELTA', motivo_devolucion = $2, updated_at = NOW()
                 WHERE id = $1`,
                [row.id, obs]
            );
        }

        await client.query(
            `INSERT INTO conciliaciones_facturacion_historial
                (facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
                 observacion, actor_user_id, actor_email, actor_nombre, actor_role, detalle)
             VALUES ($1, $2, $3, $4, 'rechazar', 'LIDER', $5, 'DEVUELTA', $6, NULL, $7, $8, 'super_admin'::user_role, $9::jsonb)`,
            [
                row.id,
                ced,
                Number(anio),
                Number(mes),
                estadoAnterior,
                obs,
                String(actorEmail || '').trim(),
                String(actorNombre || 'Líder cliente').trim(),
                JSON.stringify({ origen: 'correo_lider' })
            ]
        );
        updated += 1;
    }
    return updated;
}

async function assertServicioEnviadaOnClient(client, servicioId, year, month) {
    const q = await client.query(
        `SELECT estado_servicio FROM conciliaciones_servicio_cierre
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [String(servicioId), Number(year), Number(month)]
    );
    const cur = normalizeEstadoServicio(q.rows[0]?.estado_servicio);
    if (cur !== 'ENVIADA') {
        const error = new Error(
            cur === 'CONCILIADA'
                ? 'El servicio ya está conciliado'
                : 'El servicio debe estar en estado Enviada antes de conciliar'
        );
        error.status = cur === 'CONCILIADA' ? 400 : 400;
        throw error;
    }
}

async function markServicioConciliadaOnClient(client, scope, { servicioId, year, month, actor }) {
    const role = String(scope?.role || '').trim().toLowerCase();
    if (!CONCILIAR_SERVICIO_ROLES.has(role)) {
        const error = new Error('No autorizado para marcar el servicio como conciliado');
        error.status = 403;
        throw error;
    }

    await assertServicioEnviadaOnClient(client, servicioId, year, month);

    const email = String(actor?.email || actor?.actor_email || '').trim() || 'sistema';
    const userId = actor?.userId || actor?.id || null;

    const q = await client.query(
        `UPDATE conciliaciones_servicio_cierre
         SET estado_servicio = 'CONCILIADA',
             conciliada_at = NOW(),
             conciliada_por_user_id = $4::uuid,
             conciliada_por_email = $5,
             updated_at = NOW()
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer
         RETURNING *`,
        [String(servicioId), Number(year), Number(month), userId, email]
    );
    if (!q.rows[0]) {
        const error = new Error('Registro de cierre de servicio no encontrado');
        error.status = 404;
        throw error;
    }
}

async function markServicioDevueltaPorLiderOnClient(client, { servicioId, year, month, observacion, recipientEmail, cedulas, recipientNombre }) {
    const q = await client.query(
        `SELECT estado_servicio FROM conciliaciones_servicio_cierre
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [String(servicioId), Number(year), Number(month)]
    );
    const cur = normalizeEstadoServicio(q.rows[0]?.estado_servicio);
    if (cur !== 'ENVIADA') {
        const error = new Error('El servicio no está en estado Enviada');
        error.status = 400;
        throw error;
    }

    await markConsultoresDevueltaPorLider(client, {
        cedulas,
        anio: year,
        mes: month,
        observacion,
        actorEmail: recipientEmail,
        actorNombre: recipientNombre
    });
    await client.query(
        `UPDATE conciliaciones_servicio_cierre
         SET estado_servicio = 'LISTO_EXPORT', updated_at = NOW()
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer`,
        [String(servicioId), Number(year), Number(month)]
    );
}

async function markServicioDevueltaPorLider(pool, { servicioId, year, month, observacion, recipientEmail, cedulas, recipientNombre }) {
    const row = await getServicioCierreRow(pool, servicioId, year, month);
    const cur = normalizeEstadoServicio(row?.estado_servicio);
    if (cur !== 'ENVIADA') {
        const error = new Error('El servicio no está en estado Enviada');
        error.status = 400;
        throw error;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await markServicioDevueltaPorLiderOnClient(client, {
            servicioId,
            year,
            month,
            observacion,
            recipientEmail,
            cedulas,
            recipientNombre
        });
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    return { ok: true };
}

async function executeEmailActionTransactional(pool, scope, rawToken, { accion, observacion = null }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const row = await lockEmailActionToken(client, rawToken);
        assertTokenRowValid(row, accion);

        if (accion === 'approve') {
            await markServicioConciliadaOnClient(client, scope, {
                servicioId: row.servicio_id,
                year: row.anio,
                month: row.mes,
                actor: {
                    email: row.recipient_email,
                    actor_email: row.recipient_email,
                    nombre: row.recipient_email
                }
            });
        } else if (accion === 'reject') {
            const serviciosDynamo = require('./serviciosDynamoData');
            const serv = await serviciosDynamo._getServiceById(row.servicio_id);
            const cedulas = (serv?.consultores_asociados || []).map((a) => a.cedula).filter(Boolean);
            await markServicioDevueltaPorLiderOnClient(client, {
                servicioId: row.servicio_id,
                year: row.anio,
                month: row.mes,
                observacion,
                recipientEmail: row.recipient_email,
                recipientNombre: row.recipient_email,
                cedulas
            });
        } else {
            const error = new Error('Acción no reconocida');
            error.status = 400;
            throw error;
        }

        const consumed = await consumeEmailActionTokenLocked(client, rawToken, observacion);
        if (!consumed) {
            const error = new Error('Este enlace ya fue utilizado');
            error.status = 409;
            throw error;
        }

        await client.query('COMMIT');
        return { ok: true, estado: accion === 'approve' ? 'CONCILIADA' : 'DEVUELTA' };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getEmailActionContext(deps, rawToken) {
    const { pool } = deps;
    const { row } = await resolveEmailActionToken(pool, rawToken);
    const serviciosDynamo = require('./serviciosDynamoData');
    const serv = await serviciosDynamo._getServiceById(row.servicio_id);

    return {
        accion: row.accion,
        servicioId: row.servicio_id,
        anio: row.anio,
        mes: row.mes,
        recipientEmail: row.recipient_email,
        servicio: serv
            ? { serviceName: serv.serviceName, client: serv.client }
            : null
    };
}

async function executeEmailActionApprove(deps, scope, rawToken) {
    const { pool } = deps;
    return executeEmailActionTransactional(pool, scope, rawToken, { accion: 'approve' });
}

async function executeEmailActionReject(deps, scope, rawToken, observacion) {
    const { pool } = deps;
    const obs = String(observacion || '').trim();
    if (!obs) {
        const error = new Error('La observación es obligatoria');
        error.status = 400;
        throw error;
    }
    if (obs.length > 1000) {
        const error = new Error('La observación no puede superar 1000 caracteres');
        error.status = 400;
        throw error;
    }
    return executeEmailActionTransactional(pool, scope, rawToken, { accion: 'reject', observacion: obs });
}

module.exports = {
    resolveEmailActionTokenTtlMs,
    hashToken,
    createEmailActionTokens,
    attachActionUrlsToEvent,
    buildActionUrl,
    getEmailActionContext,
    executeEmailActionApprove,
    executeEmailActionReject,
    executeEmailActionTransactional,
    markServicioDevueltaPorLider,
    lockEmailActionToken,
    consumeEmailActionTokenLocked,
    assertTokenRowValid
};
