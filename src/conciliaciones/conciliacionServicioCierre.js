'use strict';

const { aggregateServicioCierre } = require('./facturacionAggregate');
const { isServicioCompletoRevision } = require('./conciliacionServicioCompleto');

const ESTADOS_SERVICIO = ['EN_REVISION', 'LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'];

function normalizeEstadoServicio(value) {
    const v = String(value || '').trim().toUpperCase();
    return ESTADOS_SERVICIO.includes(v) ? v : 'EN_REVISION';
}

/**
 * @param {object} pool
 * @param {string} servicioId
 * @param {number} anio
 * @param {number} mes
 */
async function getServicioCierreRow(pool, servicioId, anio, mes) {
    const q = await pool.query(
        `SELECT servicio_id, anio, mes, estado_servicio, enviada_at, enviada_por_email,
                conciliada_at, conciliada_por_email
         FROM conciliaciones_servicio_cierre
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [String(servicioId), Number(anio), Number(mes)]
    );
    return q.rows[0] || null;
}

function mapServicioCierreToApi(row) {
    if (!row) {
        return {
            estadoServicio: 'EN_REVISION',
            enviadaAt: null,
            enviadaPorEmail: null,
            conciliadaAt: null,
            conciliadaPorEmail: null
        };
    }
    return {
        estadoServicio: normalizeEstadoServicio(row.estado_servicio),
        enviadaAt: row.enviada_at ? row.enviada_at.toISOString() : null,
        enviadaPorEmail: row.enviada_por_email || null,
        conciliadaAt: row.conciliada_at ? row.conciliada_at.toISOString() : null,
        conciliadaPorEmail: row.conciliada_por_email || null
    };
}

/**
 * @param {object} pool
 * @param {string} servicioId
 * @param {number} anio
 * @param {number} mes
 */
async function ensureListoExportIfCompleto(pool, servicioId, anio, mes, agg) {
    if (!isServicioCompletoRevision(agg)) return null;
    const existing = await getServicioCierreRow(pool, servicioId, anio, mes);
    const cur = normalizeEstadoServicio(existing?.estado_servicio);
    if (cur === 'ENVIADA' || cur === 'CONCILIADA') return existing;

    const q = await pool.query(
        `INSERT INTO conciliaciones_servicio_cierre (servicio_id, anio, mes, estado_servicio, updated_at)
         VALUES ($1, $2::integer, $3::integer, 'LISTO_EXPORT', NOW())
         ON CONFLICT (servicio_id, anio, mes)
         DO UPDATE SET
            estado_servicio = CASE
                WHEN conciliaciones_servicio_cierre.estado_servicio IN ('ENVIADA', 'CONCILIADA')
                THEN conciliaciones_servicio_cierre.estado_servicio
                ELSE 'LISTO_EXPORT'
            END,
            updated_at = NOW()
         RETURNING *`,
        [String(servicioId), Number(anio), Number(mes)]
    );
    return q.rows[0] || null;
}

/**
 * @param {object} deps
 * @param {object} scope
 * @param {{ servicioId: string, year: number, month: number, rows: object[], cedulas: string[] }} ctx
 */
async function assertServicioListoExport(deps, scope, ctx) {
    const { pool } = deps;
    const servicioId = String(ctx.servicioId || '').trim();
    const year = Number(ctx.year);
    const month = Number(ctx.month);
    if (!servicioId || !Number.isFinite(year) || !Number.isFinite(month)) {
        const error = new Error('servicioId, year y month requeridos');
        error.status = 400;
        throw error;
    }

    const agg = aggregateServicioCierre(ctx.rows || [], ctx.cedulas || []);
    if (!isServicioCompletoRevision(agg)) {
        const error = new Error('El servicio aún no está completo en revisión del analista');
        error.status = 400;
        throw error;
    }

    await ensureListoExportIfCompleto(pool, servicioId, year, month, agg);
    return agg;
}

/**
 * @param {object} pool
 * @param {{ servicioId: string, year: number, month: number, actor: object }} payload
 */
async function markServicioEnviada(pool, { servicioId, year, month, actor }) {
    const row = await getServicioCierreRow(pool, servicioId, year, month);
    const cur = normalizeEstadoServicio(row?.estado_servicio);
    if (cur === 'CONCILIADA') {
        const error = new Error('El servicio ya está conciliado');
        error.status = 400;
        throw error;
    }
    if (cur !== 'LISTO_EXPORT' && cur !== 'ENVIADA') {
        const error = new Error('El servicio no está listo para exportar');
        error.status = 400;
        throw error;
    }

    const email = String(actor?.email || actor?.actor_email || '').trim() || 'sistema';
    const userId = actor?.userId || actor?.id || null;

    const q = await pool.query(
        `INSERT INTO conciliaciones_servicio_cierre
            (servicio_id, anio, mes, estado_servicio, enviada_at, enviada_por_user_id, enviada_por_email, updated_at)
         VALUES ($1, $2::integer, $3::integer, 'ENVIADA', NOW(), $4::uuid, $5, NOW())
         ON CONFLICT (servicio_id, anio, mes)
         DO UPDATE SET
            estado_servicio = 'ENVIADA',
            enviada_at = COALESCE(conciliaciones_servicio_cierre.enviada_at, NOW()),
            enviada_por_user_id = COALESCE(conciliaciones_servicio_cierre.enviada_por_user_id, EXCLUDED.enviada_por_user_id),
            enviada_por_email = COALESCE(NULLIF(conciliaciones_servicio_cierre.enviada_por_email, ''), EXCLUDED.enviada_por_email),
            updated_at = NOW()
         RETURNING *`,
        [String(servicioId), Number(year), Number(month), userId, email]
    );
    return mapServicioCierreToApi(q.rows[0]);
}

const CONCILIAR_SERVICIO_ROLES = new Set(['analista_conciliaciones', 'super_admin']);

/**
 * @param {object} pool
 * @param {object} scope
 * @param {{ servicioId: string, year: number, month: number, actor: object }} payload
 */
async function markServicioConciliada(pool, scope, { servicioId, year, month, actor }) {
    const role = String(scope?.role || '').trim().toLowerCase();
    if (!CONCILIAR_SERVICIO_ROLES.has(role)) {
        const error = new Error('No autorizado para marcar el servicio como conciliado');
        error.status = 403;
        throw error;
    }

    const row = await getServicioCierreRow(pool, servicioId, year, month);
    const cur = normalizeEstadoServicio(row?.estado_servicio);
    if (cur !== 'ENVIADA') {
        const error = new Error('El servicio debe estar en estado Enviada antes de conciliar');
        error.status = 400;
        throw error;
    }

    const email = String(actor?.email || actor?.actor_email || '').trim() || 'sistema';
    const userId = actor?.userId || actor?.id || null;

    const q = await pool.query(
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
    return mapServicioCierreToApi(q.rows[0]);
}

module.exports = {
    ESTADOS_SERVICIO,
    normalizeEstadoServicio,
    getServicioCierreRow,
    mapServicioCierreToApi,
    ensureListoExportIfCompleto,
    assertServicioListoExport,
    markServicioEnviada,
    markServicioConciliada,
    CONCILIAR_SERVICIO_ROLES
};
