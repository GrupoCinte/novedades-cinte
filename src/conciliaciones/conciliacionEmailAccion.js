'use strict';

const { createHash, randomBytes } = require('crypto');
const {
    getServicioCierreRow,
    normalizeEstadoServicio,
    CONCILIAR_SERVICIO_ROLES
} = require('./conciliacionServicioCierre');
const { normalizeColumnKeys, monthLabel } = require('./conciliacionEmailColumns');

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

function formatEmailActionTokenTtlLabel(ms = resolveEmailActionTokenTtlMs()) {
    const hours = Math.max(1, Math.round(Number(ms) / (60 * 60 * 1000)));
    if (hours >= 24 && hours % 24 === 0) {
        const days = hours / 24;
        return days === 1 ? '1 día' : `${days} días`;
    }
    return hours === 1 ? '1 hora' : `${hours} horas`;
}

function hashToken(raw) {
    return createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function normalizeCedulaLocal(value) {
    return String(value || '').replace(/\D/g, '');
}

function buildActionUrl(frontendUrl, token, accion = 'view') {
    const base = String(frontendUrl || 'http://localhost:5175').trim().replace(/\/$/, '');
    const q = new URLSearchParams({ token: String(token || '') });
    if (accion) q.set('accion', String(accion));
    return `${base}/conciliaciones/email-accion?${q.toString()}`;
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
            expectedAccion === 'view'
                ? 'Token no válido para visualización'
                : expectedAccion === 'approve'
                  ? 'Token no válido para aprobación'
                  : 'Token no válido para rechazo'
        );
        error.status = 400;
        throw error;
    }
}

function parseColumnasJson(raw) {
    if (Array.isArray(raw)) return normalizeColumnKeys(raw);
    if (raw == null || raw === '') return normalizeColumnKeys([]);
    if (typeof raw === 'string') {
        try {
            return normalizeColumnKeys(JSON.parse(raw));
        } catch {
            return normalizeColumnKeys([]);
        }
    }
    return normalizeColumnKeys([]);
}

/**
 * Token único de workspace (accion=view). Mantiene createEmailActionTokens como alias legacy.
 */
async function createEmailActionViewToken(pool, { servicioId, anio, mes, recipientEmail, eventId, columnas }) {
    const ttlMs = resolveEmailActionTokenTtlMs();
    const expira = new Date(Date.now() + ttlMs);
    const email = String(recipientEmail || '').trim().toLowerCase();
    const raw = randomBytes(32).toString('hex');
    const cols = normalizeColumnKeys(columnas);
    const q = await pool.query(
        `INSERT INTO conciliaciones_email_acciones
            (token_hash, servicio_id, anio, mes, accion, recipient_email, event_id, expira_at, columnas_json)
         VALUES ($1, $2, $3::integer, $4::integer, 'view', $5, $6, $7, $8::jsonb)
         RETURNING id, expira_at`,
        [
            hashToken(raw),
            String(servicioId),
            Number(anio),
            Number(mes),
            email,
            String(eventId || ''),
            expira,
            JSON.stringify(cols)
        ]
    );
    return {
        view: raw,
        tokenId: q.rows[0]?.id || null,
        expiraAt: q.rows[0]?.expira_at ? new Date(q.rows[0].expira_at) : expira,
        ttlMs,
        plazoLabel: formatEmailActionTokenTtlLabel(ttlMs),
        ttlHours: Math.round(ttlMs / (60 * 60 * 1000)),
        columnas: cols
    };
}

/** @deprecated Preferir createEmailActionViewToken */
async function createEmailActionTokens(pool, opts) {
    const token = await createEmailActionViewToken(pool, opts);
    return { view: token.view, approve: null, reject: null, ...token };
}

function emptyEmailTokenMeta() {
    return {
        emailTokenCreatedAt: null,
        emailExpiraAt: null,
        emailUsadoAt: null,
        emailRecipient: null,
        liderDecisiones: null
    };
}

/**
 * Meta del último token view del servicio/mes (countdown + progreso de decisiones del líder).
 * @param {object} pool
 * @param {string} servicioId
 * @param {number} anio
 * @param {number} mes
 * @param {number} [consultoresTotal=0]
 */
async function getLatestViewTokenMeta(pool, servicioId, anio, mes, consultoresTotal = 0) {
    if (!pool || !servicioId) return emptyEmailTokenMeta();
    const q = await pool.query(
        `SELECT id, created_at, expira_at, usado_at, recipient_email
         FROM conciliaciones_email_acciones
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer AND accion = 'view'
         ORDER BY created_at DESC
         LIMIT 1`,
        [String(servicioId), Number(anio), Number(mes)]
    );
    const row = q.rows[0];
    if (!row) return emptyEmailTokenMeta();

    const dec = await pool.query(
        `SELECT UPPER(TRIM(decision)) AS decision, COUNT(*)::int AS n
         FROM conciliaciones_email_decisiones
         WHERE token_id = $1
         GROUP BY UPPER(TRIM(decision))`,
        [row.id]
    );
    let aprobados = 0;
    let rechazados = 0;
    for (const r of dec.rows || []) {
        if (r.decision === 'APROBADO') aprobados = Number(r.n) || 0;
        if (r.decision === 'RECHAZADO') rechazados = Number(r.n) || 0;
    }
    const total = Math.max(0, Number(consultoresTotal) || 0);
    const pendientes = Math.max(0, total - aprobados - rechazados);

    return {
        emailTokenCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        emailExpiraAt: row.expira_at ? new Date(row.expira_at).toISOString() : null,
        emailUsadoAt: row.usado_at ? new Date(row.usado_at).toISOString() : null,
        emailRecipient: row.recipient_email ? String(row.recipient_email).trim().toLowerCase() : null,
        liderDecisiones: { aprobados, rechazados, pendientes, total }
    };
}

function attachActionUrlsToEvent(eventPayload, tokens, frontendUrl) {
    const viewToken = tokens?.view || tokens?.approve;
    const plazoLabel =
        tokens?.plazoLabel ||
        eventPayload?.plazoLabel ||
        formatEmailActionTokenTtlLabel(resolveEmailActionTokenTtlMs());
    const ttlHours =
        tokens?.ttlHours != null
            ? Number(tokens.ttlHours)
            : Math.round(resolveEmailActionTokenTtlMs() / (60 * 60 * 1000));
    const expiraAt = tokens?.expiraAt
        ? new Date(tokens.expiraAt).toISOString()
        : eventPayload?.expiraAt || null;

    return {
        ...eventPayload,
        plazoLabel,
        ttlHours,
        expiraAt,
        actions: {
            viewUrl: buildActionUrl(frontendUrl, viewToken, 'view')
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
        `SELECT id, servicio_id, anio, mes, accion, recipient_email, usado_at, expira_at, observacion, columnas_json
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
        `SELECT id, servicio_id, anio, mes, accion, recipient_email, usado_at, expira_at, observacion, columnas_json
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

async function listDecisionesByTokenId(poolOrClient, tokenId) {
    const q = await poolOrClient.query(
        `SELECT cedula, decision, observacion, decided_at
         FROM conciliaciones_email_decisiones
         WHERE token_id = $1`,
        [tokenId]
    );
    return (q.rows || []).map((r) => ({
        cedula: normalizeCedulaLocal(r.cedula),
        decision: String(r.decision || '').toUpperCase(),
        observacion: r.observacion != null ? String(r.observacion) : null,
        decidedAt: r.decided_at
    }));
}

async function upsertDecisionLocked(client, { tokenId, servicioId, anio, mes, cedula, decision, observacion }) {
    const ced = normalizeCedulaLocal(cedula);
    const dec = String(decision || '').toUpperCase();
    if (!ced) {
        const error = new Error('Cédula requerida');
        error.status = 400;
        throw error;
    }
    if (dec !== 'APROBADO' && dec !== 'RECHAZADO') {
        const error = new Error('Decisión inválida');
        error.status = 400;
        throw error;
    }
    let obs = observacion != null ? String(observacion).trim() : null;
    if (dec === 'RECHAZADO') {
        if (!obs) {
            const error = new Error('La observación es obligatoria para rechazar');
            error.status = 400;
            throw error;
        }
        if (obs.length > 1000) {
            const error = new Error('La observación no puede superar 1000 caracteres');
            error.status = 400;
            throw error;
        }
    } else {
        obs = null;
    }

    await client.query(
        `INSERT INTO conciliaciones_email_decisiones
            (token_id, servicio_id, anio, mes, cedula, decision, observacion, decided_at)
         VALUES ($1, $2, $3::integer, $4::integer, $5, $6, $7, NOW())
         ON CONFLICT (token_id, cedula) DO UPDATE SET
            decision = EXCLUDED.decision,
            observacion = EXCLUDED.observacion,
            decided_at = NOW()`,
        [tokenId, String(servicioId), Number(anio), Number(mes), ced, dec, obs]
    );
}

async function markConsultoresDevueltaPorLider(client, { cedulas, anio, mes, observacion, actorEmail, actorNombre }) {
    const obs = String(observacion || '').trim();
    const list = [...new Set((cedulas || []).map((c) => normalizeCedulaLocal(c)).filter(Boolean))];
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

/** Consultores aprobados por el líder → CONCILIADA (no heredar «Listo export» del servicio). */
async function markConsultoresConciliadaPorLider(client, { cedulas, anio, mes, actorEmail, actorNombre }) {
    const list = [...new Set((cedulas || []).map((c) => normalizeCedulaLocal(c)).filter(Boolean))];
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
        if (String(estadoAnterior).toUpperCase() === 'CONCILIADA') {
            updated += 1;
            continue;
        }

        if (!row) {
            const ins = await client.query(
                `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, fecha_cierre, updated_at)
                 VALUES ($1, $2::integer, $3::integer, 'CONCILIADA', CURRENT_DATE, NOW())
                 RETURNING id, estado`,
                [ced, Number(anio), Number(mes)]
            );
            row = ins.rows[0];
        } else {
            await client.query(
                `UPDATE conciliaciones_facturacion
                 SET estado = 'CONCILIADA', motivo_devolucion = NULL, updated_at = NOW()
                 WHERE id = $1`,
                [row.id]
            );
        }

        await client.query(
            `INSERT INTO conciliaciones_facturacion_historial
                (facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
                 observacion, actor_user_id, actor_email, actor_nombre, actor_role, detalle)
             VALUES ($1, $2, $3, $4, 'aprobar', 'LIDER', $5, 'CONCILIADA', $6, NULL, $7, $8, 'super_admin'::user_role, $9::jsonb)`,
            [
                row.id,
                ced,
                Number(anio),
                Number(mes),
                estadoAnterior,
                'Aprobado por líder desde correo',
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
        error.status = 400;
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

async function markServicioDevueltaPorLiderOnClient(
    client,
    { servicioId, year, month, observacion, recipientEmail, cedulas, recipientNombre }
) {
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

async function markServicioDevueltaPorLider(pool, opts) {
    const row = await getServicioCierreRow(pool, opts.servicioId, opts.year, opts.month);
    const cur = normalizeEstadoServicio(row?.estado_servicio);
    if (cur !== 'ENVIADA') {
        const error = new Error('El servicio no está en estado Enviada');
        error.status = 400;
        throw error;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await markServicioDevueltaPorLiderOnClient(client, opts);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    return { ok: true };
}

function serializeWorkspaceRow(row, columnas) {
    const keys = normalizeColumnKeys(columnas);
    const out = { cedula: normalizeCedulaLocal(row?.cedula), nombre: String(row?.nombre || '').trim() };
    for (const k of keys) {
        if (k === 'novedadesTipos') {
            out[k] = Array.isArray(row?.novedadesTipos) ? row.novedadesTipos : [];
            continue;
        }
        out[k] = row?.[k];
    }
    // Helpers de formato (días / novedades) aunque no estén en columnas seleccionadas
    out.diasFacturables = row?.diasFacturables;
    out.diasMes = row?.diasMes;
    out.prorrateoAplicado = Boolean(row?.prorrateoAplicado);
    out.novedadesCount = Number(row?.novedadesCount) || 0;
    if (!Array.isArray(out.novedadesTipos)) {
        out.novedadesTipos = Array.isArray(row?.novedadesTipos) ? row.novedadesTipos : [];
    }
    out.novedadesDetalle = Array.isArray(row?.novedadesDetalle)
        ? row.novedadesDetalle.map((d) => ({
              tipo: String(d?.tipo || '').trim(),
              creadoEn: d?.creadoEn || d?.creado_en || null
          })).filter((d) => d.tipo)
        : [];
    if (out.novedadesSumCop == null) out.novedadesSumCop = row?.novedadesSumCop;
    if (out.novedadesSumaCop == null) out.novedadesSumaCop = row?.novedadesSumaCop;
    if (out.facturaCop == null) out.facturaCop = row?.facturaCop;
    if (out.tarifaCliente == null) out.tarifaCliente = row?.tarifaCliente;
    if (!out.cedula && row?.cedula) out.cedula = normalizeCedulaLocal(row.cedula);
    const estadoFact = String(row?.estado || '').trim().toUpperCase() || 'PENDIENTE';
    out.estadoFacturacion = estadoFact;
    // Ya conciliados por el líder en un ciclo anterior: no se reabre aprobar/rechazar
    out.locked = estadoFact === 'CONCILIADA';
    return out;
}

async function assertConsultorEditableEnCorreo(client, { cedula, anio, mes }) {
    const ced = normalizeCedulaLocal(cedula);
    const q = await client.query(
        `SELECT estado FROM conciliaciones_facturacion
         WHERE regexp_replace(cedula, '[^0-9]', '', 'g') = $1
           AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [ced, Number(anio), Number(mes)]
    );
    const estado = String(q.rows[0]?.estado || '').trim().toUpperCase();
    if (estado === 'CONCILIADA') {
        const error = new Error(
            'Este consultor ya está conciliado; solo se pueden decidir las filas pendientes o devueltas'
        );
        error.status = 400;
        throw error;
    }
    return estado;
}

async function getEmailActionContext(deps, rawToken) {
    const { pool } = deps;
    const { row } = await resolveEmailActionToken(pool, rawToken);
    if (String(row.accion) !== 'view' && String(row.accion) !== 'approve' && String(row.accion) !== 'reject') {
        const error = new Error('Token no válido');
        error.status = 400;
        throw error;
    }

    const cierre = await getServicioCierreRow(pool, row.servicio_id, row.anio, row.mes);
    const estadoServicio = normalizeEstadoServicio(cierre?.estado_servicio);

    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { loadConsultoresRowsForServicio } = require('./conciliacionServicioEmail');
    let rows = [];
    let servicioMeta = null;
    try {
        const loaded = await loadConsultoresRowsForServicio(deps, scope, {
            servicioId: row.servicio_id,
            year: row.anio,
            month: row.mes
        });
        rows = loaded.rows || [];
        servicioMeta = {
            serviceName: loaded.serv?.serviceName || null,
            client: loaded.clienteCanon || loaded.serv?.client || null
        };
    } catch (e) {
        const serviciosDynamo = require('./serviciosDynamoData');
        const serv = await serviciosDynamo._getServiceById(row.servicio_id);
        servicioMeta = serv ? { serviceName: serv.serviceName, client: serv.client } : null;
        if (e.status && e.status !== 404) throw e;
    }

    const columnas = parseColumnasJson(row.columnas_json);
    const decisiones = await listDecisionesByTokenId(pool, row.id);
    const decisionMap = new Map(decisiones.map((d) => [d.cedula, d]));
    const workspaceRows = rows.map((r) => {
        const ced = normalizeCedulaLocal(r.cedula);
        const d = decisionMap.get(ced);
        const serialized = serializeWorkspaceRow(r, columnas);
        const locked = Boolean(serialized.locked);
        return {
            ...serialized,
            // Conciliados previos: se muestran como aprobados y no requieren nueva decisión
            decision: locked ? d?.decision || 'APROBADO' : d?.decision || null,
            decisionObservacion: d?.observacion || null
        };
    });

    const pendientes = workspaceRows.filter((r) => r.cedula && !r.locked);
    const todosDecididos =
        pendientes.length === 0
            ? workspaceRows.length > 0
            : pendientes.every((r) => decisionMap.has(r.cedula));
    const puedeFinalizar = todosDecididos && estadoServicio === 'ENVIADA' && !row.usado_at;

    const ttlMs = resolveEmailActionTokenTtlMs();
    return {
        accion: 'view',
        servicioId: row.servicio_id,
        anio: row.anio,
        mes: row.mes,
        mesLabel: monthLabel(row.anio, row.mes),
        recipientEmail: row.recipient_email,
        servicio: servicioMeta,
        estadoServicio,
        columnas,
        rows: workspaceRows,
        decisiones,
        todosDecididos,
        puedeFinalizar,
        expiraAt: row.expira_at ? new Date(row.expira_at).toISOString() : null,
        plazoLabel: formatEmailActionTokenTtlLabel(ttlMs),
        ttlHours: Math.round(ttlMs / (60 * 60 * 1000))
    };
}

async function executeEmailActionDecide(deps, rawToken, { cedula, decision, observacion }) {
    const { pool } = deps;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const row = await lockEmailActionToken(client, rawToken);
        assertTokenRowValid(row, 'view');
        await assertServicioEnviadaOnClient(client, row.servicio_id, row.anio, row.mes);

        await assertConsultorEditableEnCorreo(client, {
            cedula,
            anio: row.anio,
            mes: row.mes
        });

        await upsertDecisionLocked(client, {
            tokenId: row.id,
            servicioId: row.servicio_id,
            anio: row.anio,
            mes: row.mes,
            cedula,
            decision,
            observacion
        });

        const decisiones = await listDecisionesByTokenId(client, row.id);
        await client.query('COMMIT');

        const ctx = await getEmailActionContext(deps, rawToken);
        return {
            ok: true,
            decision: String(decision || '').toUpperCase(),
            cedula: normalizeCedulaLocal(cedula),
            decisiones,
            todosDecididos: ctx.todosDecididos,
            puedeFinalizar: ctx.puedeFinalizar,
            rows: ctx.rows
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function executeEmailActionDecideMasivo(deps, rawToken, { decision, observacion, cedulas }) {
    const { pool } = deps;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const row = await lockEmailActionToken(client, rawToken);
        assertTokenRowValid(row, 'view');
        await assertServicioEnviadaOnClient(client, row.servicio_id, row.anio, row.mes);

        const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        const { loadConsultoresRowsForServicio } = require('./conciliacionServicioEmail');
        const loaded = await loadConsultoresRowsForServicio(deps, scope, {
            servicioId: row.servicio_id,
            year: row.anio,
            month: row.mes
        });
        const allRows = loaded.rows || [];
        const allCeds = allRows.map((r) => normalizeCedulaLocal(r.cedula)).filter(Boolean);
        const lockedSet = new Set(
            allRows
                .filter((r) => String(r.estado || '').toUpperCase() === 'CONCILIADA')
                .map((r) => normalizeCedulaLocal(r.cedula))
                .filter(Boolean)
        );
        const requested = Array.isArray(cedulas)
            ? cedulas.map(normalizeCedulaLocal).filter(Boolean)
            : null;
        let target = requested?.length
            ? allCeds.filter((c) => requested.includes(c))
            : allCeds;
        // No reabrir conciliados en acciones masivas
        target = target.filter((c) => !lockedSet.has(c));

        if (!target.length) {
            const error = new Error(
                lockedSet.size
                    ? 'No hay consultores pendientes: los conciliados no se pueden volver a decidir'
                    : 'No hay consultores para decidir'
            );
            error.status = 400;
            throw error;
        }

        for (const ced of target) {
            await upsertDecisionLocked(client, {
                tokenId: row.id,
                servicioId: row.servicio_id,
                anio: row.anio,
                mes: row.mes,
                cedula: ced,
                decision,
                observacion
            });
        }

        await client.query('COMMIT');
        const ctx = await getEmailActionContext(deps, rawToken);
        return {
            ok: true,
            decision: String(decision || '').toUpperCase(),
            afectados: target.length,
            todosDecididos: ctx.todosDecididos,
            puedeFinalizar: ctx.puedeFinalizar,
            rows: ctx.rows
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function executeEmailActionFinalize(deps, scope, rawToken) {
    const { pool, emailNotificationsPublisher, frontendUrl } = deps;
    const client = await pool.connect();
    let finalizeResult = null;
    let tokenRow = null;
    let decisiones = [];
    try {
        await client.query('BEGIN');
        const row = await lockEmailActionToken(client, rawToken);
        assertTokenRowValid(row, 'view');
        tokenRow = row;
        await assertServicioEnviadaOnClient(client, row.servicio_id, row.anio, row.mes);

        const loadScope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
        const { loadConsultoresRowsForServicio } = require('./conciliacionServicioEmail');
        const loaded = await loadConsultoresRowsForServicio(deps, loadScope, {
            servicioId: row.servicio_id,
            year: row.anio,
            month: row.mes
        });
        const loadedRows = loaded.rows || [];
        const allCeds = loadedRows.map((r) => normalizeCedulaLocal(r.cedula)).filter(Boolean);
        const estadoByCed = new Map(
            loadedRows.map((r) => [normalizeCedulaLocal(r.cedula), String(r.estado || '').toUpperCase()])
        );
        const lockedCeds = allCeds.filter((c) => estadoByCed.get(c) === 'CONCILIADA');
        const actionableCeds = allCeds.filter((c) => estadoByCed.get(c) !== 'CONCILIADA');
        decisiones = await listDecisionesByTokenId(client, row.id);
        const decisionMap = new Map(decisiones.map((d) => [d.cedula, d]));

        if (!allCeds.length) {
            const error = new Error('No hay consultores en el alcance del servicio');
            error.status = 400;
            throw error;
        }
        const missing = actionableCeds.filter((c) => !decisionMap.has(c));
        if (missing.length) {
            const error = new Error('Aún hay consultores sin decisión');
            error.status = 400;
            throw error;
        }

        const rechazados = actionableCeds.filter((c) => decisionMap.get(c)?.decision === 'RECHAZADO');
        const aprobadosNuevos = actionableCeds.filter((c) => decisionMap.get(c)?.decision === 'APROBADO');
        const aprobados = [...lockedCeds, ...aprobadosNuevos];

        if (aprobadosNuevos.length) {
            await markConsultoresConciliadaPorLider(client, {
                cedulas: aprobadosNuevos,
                anio: row.anio,
                mes: row.mes,
                actorEmail: row.recipient_email,
                actorNombre: row.recipient_email
            });
        }

        if (rechazados.length) {
            for (const ced of rechazados) {
                const d = decisionMap.get(ced);
                await markConsultoresDevueltaPorLider(client, {
                    cedulas: [ced],
                    anio: row.anio,
                    mes: row.mes,
                    observacion: d?.observacion || 'Rechazado por líder',
                    actorEmail: row.recipient_email,
                    actorNombre: row.recipient_email
                });
            }
            await client.query(
                `UPDATE conciliaciones_servicio_cierre
                 SET estado_servicio = 'LISTO_EXPORT', updated_at = NOW()
                 WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer`,
                [String(row.servicio_id), Number(row.anio), Number(row.mes)]
            );
        } else {
            await markServicioConciliadaOnClient(client, scope || { role: 'super_admin' }, {
                servicioId: row.servicio_id,
                year: row.anio,
                month: row.mes,
                actor: {
                    email: row.recipient_email,
                    actor_email: row.recipient_email,
                    nombre: row.recipient_email
                }
            });
        }

        const consumed = await consumeEmailActionTokenLocked(client, rawToken, null);
        if (!consumed) {
            const error = new Error('Este enlace ya fue utilizado');
            error.status = 409;
            throw error;
        }

        await client.query('COMMIT');

        let kind = 'aprobada';
        let estado = 'CONCILIADA';
        if (rechazados.length && aprobados.length) {
            kind = 'parcial';
            estado = 'LISTO_EXPORT';
        } else if (rechazados.length) {
            kind = 'rechazada';
            estado = 'LISTO_EXPORT';
        }

        finalizeResult = {
            ok: true,
            estado,
            kind,
            aprobados: aprobados.length,
            rechazados: rechazados.length,
            servicioId: row.servicio_id,
            anio: row.anio,
            mes: row.mes,
            recipientEmail: row.recipient_email,
            servicioName: loaded.serv?.serviceName || null,
            cliente: loaded.clienteCanon || loaded.serv?.client || null
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    if (finalizeResult && typeof emailNotificationsPublisher?.publishConciliacionStakeholdersAviso === 'function') {
        try {
            const { notifyStakeholdersConciliacionDecision } = require('./conciliacionServicioNotify');
            await notifyStakeholdersConciliacionDecision(deps, {
                kind: finalizeResult.kind,
                servicioId: finalizeResult.servicioId,
                servicioName: finalizeResult.servicioName,
                cliente: finalizeResult.cliente,
                anio: finalizeResult.anio,
                mes: finalizeResult.mes,
                liderEmail: finalizeResult.recipientEmail,
                aprobados: finalizeResult.aprobados,
                rechazados: finalizeResult.rechazados,
                frontendUrl
            });
        } catch (e) {
            console.error('[conciliaciones/email] Error notificando stakeholders post-finalize', e);
        }
    }

    return finalizeResult;
}

/** Legacy: approve/reject globales — se mantiene por compat tests; preferir finalize */
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

async function executeEmailActionApprove(deps, scope, rawToken) {
    return executeEmailActionTransactional(deps.pool, scope, rawToken, { accion: 'approve' });
}

async function executeEmailActionReject(deps, scope, rawToken, observacion) {
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
    return executeEmailActionTransactional(deps.pool, scope, rawToken, { accion: 'reject', observacion: obs });
}

module.exports = {
    resolveEmailActionTokenTtlMs,
    formatEmailActionTokenTtlLabel,
    hashToken,
    createEmailActionViewToken,
    createEmailActionTokens,
    getLatestViewTokenMeta,
    emptyEmailTokenMeta,
    attachActionUrlsToEvent,
    buildActionUrl,
    getEmailActionContext,
    executeEmailActionDecide,
    executeEmailActionDecideMasivo,
    executeEmailActionFinalize,
    executeEmailActionApprove,
    executeEmailActionReject,
    executeEmailActionTransactional,
    markServicioDevueltaPorLider,
    lockEmailActionToken,
    consumeEmailActionTokenLocked,
    assertTokenRowValid
};
