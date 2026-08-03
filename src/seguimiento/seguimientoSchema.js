async function ensureSeguimientoTables(pool) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_acta (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                gp_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                cliente TEXT NOT NULL,
                consultor_cedula TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE RESTRICT,
                fecha_acta DATE NOT NULL DEFAULT CURRENT_DATE,
                estado VARCHAR(50) NOT NULL DEFAULT 'Borrador',
                compromisos TEXT NULL,
                observaciones TEXT NULL,
                deleted_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await pool.query('CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_gp ON seguimiento_acta(gp_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_cliente ON seguimiento_acta(cliente)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_consultor ON seguimiento_acta(consultor_cedula)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_deleted ON seguimiento_acta(deleted_at) WHERE deleted_at IS NULL');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_participante (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
                nombre TEXT NOT NULL,
                rol VARCHAR(100) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await pool.query('CREATE INDEX IF NOT EXISTS idx_seguimiento_participante_acta ON seguimiento_participante(acta_id)');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_historial (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
                accion VARCHAR(50) NOT NULL,
                estado_anterior VARCHAR(50) NULL,
                estado_nuevo VARCHAR(50) NULL,
                actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
                actor_email TEXT NOT NULL,
                actor_role VARCHAR(50) NOT NULL,
                detalle JSONB NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await pool.query('CREATE INDEX IF NOT EXISTS idx_seguimiento_historial_acta ON seguimiento_historial(acta_id)');

    } catch (error) {
        if (String(error?.code || '') === '42501') {
            console.warn('[Seguimiento] Permisos insuficientes para DDL de seguimiento_acta. Se asumen tablas existentes.');
            return;
        }
        throw error;
    }
}

module.exports = {
    ensureSeguimientoTables
};
