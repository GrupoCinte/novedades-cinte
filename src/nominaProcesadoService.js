'use strict';

const { canRoleViewType } = require('./rbac');

const MAX_IDS = 500;
const ALLOWED_ROLES = new Set(['nomina', 'super_admin', 'cac']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveActorUserId(pool, req) {
    const actorSub = String(req.user?.sub || '').trim();
    const actorUserIdRaw = UUID_RE.test(actorSub) ? actorSub : null;
    if (!actorUserIdRaw && !req.user?.email) return null;
    try {
        const uq = await pool.query('SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1', [
            actorUserIdRaw,
            req.user?.email || ''
        ]);
        return uq.rows[0]?.id || null;
    } catch {
        return null;
    }
}

async function writeNominaProcesadoAudit(pool, { actorUserId, actorRole, entityId, metadata }) {
    try {
        await pool.query(
            `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
             VALUES ($1::uuid, $2::user_role, $3, $4, $5::uuid, $6::jsonb)`,
            [actorUserId, actorRole || null, 'nomina_procesado', 'novedad', entityId, JSON.stringify(metadata || {})]
        );
    } catch (e) {
        console.warn('[nomina-procesado] audit_log omitido:', e.message);
    }
}

function canMarkNominaProcesadoRole(role) {
    return ALLOWED_ROLES.has(String(role || ''));
}

function normalizeListFilters(raw) {
    const f = raw && typeof raw === 'object' ? raw : {};
    const leadRaw = String(f.leadTimeBucket || '').trim();
    return {
        tipo: String(f.tipo || '').trim(),
        estado: String(f.estado || '').trim(),
        nombre: String(f.nombre || '').trim(),
        cliente: String(f.cliente || '').trim(),
        createdFrom: String(f.createdFrom || '').trim(),
        createdTo: String(f.createdTo || '').trim(),
        gpUserId: String(f.gpUserId || '').trim(),
        leadTimeBucket: /^[0-3]$/.test(leadRaw) ? leadRaw : '',
        nominaProcesado: String(f.nominaProcesado || '').trim().toLowerCase(),
        fechaInicioDesde: String(f.fechaInicioDesde || '').trim(),
        fechaInicioHasta: String(f.fechaInicioHasta || '').trim()
    };
}

function parseIdList(rawIds) {
    if (!Array.isArray(rawIds)) return [];
    const seen = new Set();
    const out = [];
    for (const x of rawIds) {
        const id = String(x || '').trim();
        if (!UUID_RE.test(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
async function markNominaProcesado({ pool, req, buildScopedNovedadesWhere, body }) {
    const role = req.user?.role || '';
    if (!canMarkNominaProcesadoRole(role)) {
        return { status: 403, body: { ok: false, error: 'Sin permiso para marcar procesado nómina.' } };
    }

    const loteRaw = String(body?.lote ?? '').trim();
    const lote = loteRaw || null;
    if (lote && lote.length > 120) {
        return { status: 400, body: { ok: false, error: 'La etiqueta de lote no puede superar 120 caracteres.' } };
    }

    let targetIds = parseIdList(body?.ids);
    if (targetIds.length > MAX_IDS) {
        return { status: 400, body: { ok: false, error: `Máximo ${MAX_IDS} ids por solicitud.` } };
    }

    const hasFilters = body?.filters && typeof body.filters === 'object';
    if (hasFilters) {
        const filters = normalizeListFilters(body.filters);
        const w = await buildScopedNovedadesWhere(req.scope, filters);
        if (w.empty) {
            if (!targetIds.length) {
                return { status: 200, body: { ok: true, marked: 0, skipped: 0, ids: [] } };
            }
        } else {
            const extra = ["nov.estado = 'Aprobado'::novedad_estado", 'nov.nomina_procesado_en IS NULL'];
            const whereClause = w.whereSql ? `${w.whereSql} AND ${extra.join(' AND ')}` : `WHERE ${extra.join(' AND ')}`;
            const q = await pool.query(
                `SELECT nov.id, nov.tipo_novedad FROM novedades nov ${whereClause} LIMIT ${MAX_IDS + 1}`,
                w.params
            );
            if (q.rows.length > MAX_IDS) {
                return {
                    status: 400,
                    body: {
                        ok: false,
                        error: `El filtro supera el máximo de ${MAX_IDS} novedades. Acota filtros o usa ids explícitos.`
                    }
                };
            }
            const fromFilters = q.rows.filter((r) => canRoleViewType(role, r.tipo_novedad)).map((r) => r.id);
            targetIds = [...new Set([...targetIds, ...fromFilters])];
        }
    }

    if (!targetIds.length) {
        return { status: 400, body: { ok: false, error: 'No hay novedades elegibles para marcar.' } };
    }
    if (targetIds.length > MAX_IDS) {
        return { status: 400, body: { ok: false, error: `Máximo ${MAX_IDS} ids por solicitud.` } };
    }

    const actorUserId = await resolveActorUserId(pool, req);
    const actorEmail = String(req.user?.email || '').trim() || null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const updateRes = await client.query(
            `UPDATE novedades SET
                nomina_procesado_en = COALESCE(nomina_procesado_en, NOW()),
                nomina_procesado_por_user_id = COALESCE(nomina_procesado_por_user_id, $2::uuid),
                nomina_procesado_por_email = COALESCE(nomina_procesado_por_email, $3),
                nomina_procesado_lote = COALESCE(nomina_procesado_lote, $4)
             WHERE id = ANY($1::uuid[])
               AND estado = 'Aprobado'::novedad_estado
               AND nomina_procesado_en IS NULL
             RETURNING id`,
            [targetIds, actorUserId, actorEmail, lote]
        );
        const markedIds = updateRes.rows.map((r) => r.id);
        const marked = markedIds.length;
        const skipped = targetIds.length - marked;

        for (const id of markedIds) {
            await writeNominaProcesadoAudit(client, {
                actorUserId,
                actorRole: role,
                entityId: id,
                metadata: { lote, batchSize: marked }
            });
        }

        await client.query('COMMIT');
        return { status: 200, body: { ok: true, marked, skipped, ids: markedIds } };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
    markNominaProcesado,
    canMarkNominaProcesadoRole,
    normalizeListFilters,
    parseIdList,
    MAX_IDS
};
