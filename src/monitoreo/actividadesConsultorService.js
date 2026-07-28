const { z } = require('zod');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const actividadesQuerySchema = z.object({
    fechaDesde: z.string().regex(ISO_DATE_RE, 'fechaDesde debe tener formato YYYY-MM-DD').optional(),
    fechaHasta: z.string().regex(ISO_DATE_RE, 'fechaHasta debe tener formato YYYY-MM-DD').optional(),
    cedula: z.string().trim().min(1).max(30).regex(/^\d+$/, 'cedula debe contener solo dígitos').optional()
});

function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parseActividadesConsultorQuery(query = {}) {
    const parsed = actividadesQuerySchema.safeParse({
        fechaDesde: query.fechaDesde || undefined,
        fechaHasta: query.fechaHasta || undefined,
        cedula: query.cedula || undefined
    });
    if (!parsed.success) {
        throw createHttpError(400, parsed.error.issues[0]?.message || 'Filtros inválidos');
    }
    const filters = parsed.data;
    if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) {
        throw createHttpError(400, 'fechaDesde no puede ser posterior a fechaHasta');
    }
    return filters;
}

function buildActividadesConsultorQuery({ filters = {}, role = '', gpUserId = '' } = {}) {
    const params = [];
    const where = [];
    const addParam = (value) => {
        params.push(value);
        return `$${params.length}`;
    };

    if (filters.fechaDesde) where.push(`a.inicio >= ${addParam(filters.fechaDesde)}::date`);
    if (filters.fechaHasta) where.push(`a.inicio < (${addParam(filters.fechaHasta)}::date + INTERVAL '1 day')`);
    if (filters.cedula) where.push(`a.cedula = ${addParam(filters.cedula)}`);
    if (role === 'gp') {
        if (!UUID_RE.test(String(gpUserId || '').trim())) {
            throw createHttpError(403, 'No fue posible resolver el alcance del GP');
        }
        where.push(`c.gp_user_id = ${addParam(String(gpUserId).trim())}::uuid`);
    }

    return {
        sql: `
            SELECT a.id, a.cedula, c.nombre AS consultor_nombre, a.cliente,
                   a.descripcion, a.inicio, a.fin, a.origen, a.estado
            FROM actividades_consultor a
            INNER JOIN colaboradores c ON c.cedula = a.cedula
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY LOWER(a.cliente) ASC, LOWER(c.nombre) ASC, a.inicio DESC
            LIMIT 1000
        `,
        params
    };
}

async function listActividadesConsultor(pool, options = {}) {
    const { sql, params } = buildActividadesConsultorQuery(options);
    const result = await pool.query(sql, params);
    return Array.isArray(result?.rows) ? result.rows : [];
}

module.exports = {
    parseActividadesConsultorQuery,
    buildActividadesConsultorQuery,
    listActividadesConsultor
};
