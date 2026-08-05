const { z } = require('zod');
const { resolveActorUserIdForSession } = require('../resolveActorUserId');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OBSERVACIONES_LEN = 1000;

const actividadesQuerySchema = z.object({
    fechaDesde: z.string().regex(ISO_DATE_RE, 'fechaDesde debe tener formato YYYY-MM-DD').optional(),
    fechaHasta: z.string().regex(ISO_DATE_RE, 'fechaHasta debe tener formato YYYY-MM-DD').optional(),
    cedula: z.string().trim().min(1).max(30).regex(/^\d+$/, 'cedula debe contener solo dígitos').optional(),
    cliente: z.string().trim().min(1).max(200).optional()
});

function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

/** Devuelve rango del mes actual en zona Bogotá como { desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' }. */
function currentMonthRange() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    return { desde: `${y}-${pad(m)}-01`, hasta: `${y}-${pad(m)}-${pad(lastDay)}` };
}

function parseActividadesConsultorQuery(query = {}) {
    const parsed = actividadesQuerySchema.safeParse({
        fechaDesde: query.fechaDesde || undefined,
        fechaHasta: query.fechaHasta || undefined,
        cedula: query.cedula || undefined,
        cliente: query.cliente || undefined
    });
    if (!parsed.success) {
        throw createHttpError(400, parsed.error.issues[0]?.message || 'Filtros inválidos');
    }
    const filters = parsed.data;
    if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) {
        throw createHttpError(400, 'fechaDesde no puede ser posterior a fechaHasta');
    }
    // Mes actual por defecto si no se envían fechas (evitar carga sin acotar).
    if (!filters.fechaDesde && !filters.fechaHasta) {
        const range = currentMonthRange();
        filters.fechaDesde = range.desde;
        filters.fechaHasta = range.hasta;
    }
    return filters;
}

function buildActividadesConsultorQuery({ filters = {}, role = '', gpUserId = '' } = {}) {
    const params = [];
    const where = ['a.fin IS NOT NULL']; // Excluir temporizadores abiertos
    const addParam = (value) => {
        params.push(value);
        return `$${params.length}`;
    };

    if (filters.fechaDesde) where.push(`timezone('America/Bogota', a.inicio)::date >= ${addParam(filters.fechaDesde)}::date`);
    if (filters.fechaHasta) where.push(`timezone('America/Bogota', a.inicio)::date <= ${addParam(filters.fechaHasta)}::date`);
    if (filters.cedula) where.push(`a.cedula = ${addParam(filters.cedula)}`);
    if (filters.cliente) where.push(`a.cliente = ${addParam(filters.cliente)}`);
    if (role === 'gp') {
        if (!UUID_RE.test(String(gpUserId || '').trim())) {
            throw createHttpError(403, 'No fue posible resolver el alcance del GP');
        }
        where.push(`c.gp_user_id = ${addParam(String(gpUserId).trim())}::uuid`);
    }

    return {
        sql: `
            SELECT a.id, a.cedula, c.nombre AS consultor_nombre, a.cliente,
                   a.descripcion, a.inicio, a.fin, a.origen, a.estado,
                   a.aprobado_por_email, a.aprobado_en,
                   a.rechazado_por_email, a.rechazado_en,
                   a.observaciones_rechazo
            FROM actividades_consultor a
            INNER JOIN colaboradores c ON c.cedula = a.cedula
            WHERE ${where.join(' AND ')}
            ORDER BY LOWER(a.cliente) ASC, LOWER(c.nombre) ASC, a.inicio DESC
        `,
        params
    };
}

async function listActividadesConsultor(pool, options = {}) {
    const { sql, params } = buildActividadesConsultorQuery(options);
    const result = await pool.query(sql, params);
    return Array.isArray(result?.rows) ? result.rows : [];
}

// ── Decisión: aprobar / rechazar ────────────────────────────────────────

function validateObservacionesRechazo(raw) {
    const value = String(raw || '').trim();
    if (!value) return { ok: false, error: 'Indica la observación de rechazo (causa e indicaciones para el consultor).' };
    if (value.length > MAX_OBSERVACIONES_LEN) return { ok: false, error: `La observación de rechazo no puede superar ${MAX_OBSERVACIONES_LEN} caracteres.` };
    return { ok: true, value };
}

async function updateActividadEstado(pool, { id, nuevoEstado, observaciones, actor, role, gpUserId }) {
    if (!UUID_RE.test(String(id || '').trim())) {
        throw createHttpError(400, 'ID de actividad inválido');
    }
    const estado = String(nuevoEstado || '').trim().toLowerCase();
    if (!['aprobado', 'rechazado'].includes(estado)) {
        throw createHttpError(400, 'El estado debe ser aprobado o rechazado');
    }

    // Validar observaciones si es rechazo
    if (estado === 'rechazado') {
        const v = validateObservacionesRechazo(observaciones);
        if (!v.ok) throw createHttpError(400, v.error);
    }

    // Verificar existencia y alcance GP
    const check = await pool.query(
        `SELECT a.id, a.estado, c.gp_user_id
         FROM actividades_consultor a
         INNER JOIN colaboradores c ON c.cedula = a.cedula
         WHERE a.id = $1`,
        [id]
    );
    if (!check.rows.length) throw createHttpError(404, 'Actividad no encontrada');

    const row = check.rows[0];
    if (role === 'gp') {
        if (String(row.gp_user_id || '') !== String(gpUserId || '')) {
            throw createHttpError(403, 'No tiene permisos para decidir sobre esta actividad');
        }
    }

    // Resolver actor_user_id real (UUID de la tabla users)
    const actorUserId = await resolveActorUserIdForSession(pool, { sub: actor.userId, email: actor.email });
    if (!actorUserId) {
        throw createHttpError(403, 'No se pudo verificar la identidad del usuario en la base de datos');
    }

    const now = new Date();
    const obs = String(observaciones || '').trim() || null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (estado === 'aprobado') {
            await client.query(
                `UPDATE actividades_consultor
                 SET estado = 'aprobado',
                     aprobado_por_user_id = $2, aprobado_por_rol = $3::user_role,
                     aprobado_por_email = $4, aprobado_en = $5,
                     observaciones_rechazo = $6,
                     rechazado_por_user_id = NULL, rechazado_por_rol = NULL,
                     rechazado_por_email = NULL, rechazado_en = NULL
                 WHERE id = $1`,
                [id, actorUserId, actor.role, actor.email, now, obs]
            );
        } else {
            await client.query(
                `UPDATE actividades_consultor
                 SET estado = 'rechazado',
                     rechazado_por_user_id = $2, rechazado_por_rol = $3::user_role,
                     rechazado_por_email = $4, rechazado_en = $5,
                     observaciones_rechazo = $6,
                     aprobado_por_user_id = NULL, aprobado_por_rol = NULL,
                     aprobado_por_email = NULL, aprobado_en = NULL
                 WHERE id = $1`,
                [id, actorUserId, actor.role, actor.email, now, obs]
            );
        }

        // Auditoría genérica usando el actorUserId real (users.id UUID válido)
        await client.query(
            `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
             VALUES ($1, $2::user_role, $3, 'actividad_consultor', $4, $5::jsonb)`,
            [actorUserId, actor.role, `actividad_${estado}`, id,
             JSON.stringify({ estado_anterior: row.estado, estado_nuevo: estado, observaciones: obs })]
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    return { ok: true, estado };
}

module.exports = {
    parseActividadesConsultorQuery,
    buildActividadesConsultorQuery,
    listActividadesConsultor,
    updateActividadEstado,
    validateObservacionesRechazo,
    currentMonthRange,
    MAX_OBSERVACIONES_LEN
};
