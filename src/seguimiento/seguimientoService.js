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
    async function listActas({ gpId = null, limit = 50, offset = 0 } = {}) {
        const queryParams = [];
        let whereClause = "WHERE a.deleted_at IS NULL";

        if (gpId) {
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
                a.consultor_cedula,
                a.fecha_acta,
                a.estado,
                a.created_at,
                a.updated_at,
                (
                    SELECT json_agg(json_build_object('nombre', p.nombre, 'rol', p.rol))
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

    return {
        listActas
    };
}

module.exports = {
    createSeguimientoService
};
