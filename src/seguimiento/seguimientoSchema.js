/**
 * DDL Seguimiento a Consultores/Clientes (ADR §7.0 / AUT-282).
 */
function createSeguimientoSchema({ pool }) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('createSeguimientoSchema: pool es obligatorio.');
    }

    async function ensureSeguimientoTables() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_acta (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              tipo TEXT NOT NULL CHECK (tipo IN ('consultor', 'cliente')),
              estado TEXT NOT NULL CHECK (estado IN ('borrador', 'finalizado')),
              cliente_nombre TEXT NOT NULL,
              gp_user_id UUID NULL,
              creado_por_user_id UUID NULL,
              creado_por_email TEXT NULL,
              fecha_seguimiento DATE NOT NULL,
              payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              finalizado_at TIMESTAMPTZ NULL,
              correo_cierre_estado TEXT NOT NULL DEFAULT 'no_aplica'
                CHECK (correo_cierre_estado IN ('no_aplica', 'pendiente', 'enviado', 'fallido')),
              correos_cierre_enviados_at TIMESTAMPTZ NULL,
              correo_cierre_last_error TEXT NULL,
              ciclo_vence_at DATE NULL,
              reminder_t5_sent_at TIMESTAMPTZ NULL,
              reminder_t1_sent_at TIMESTAMPTZ NULL,
              deleted_at TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_gp ON seguimiento_acta (gp_user_id)
              WHERE deleted_at IS NULL
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_ciclo ON seguimiento_acta (ciclo_vence_at)
              WHERE deleted_at IS NULL AND correo_cierre_estado = 'enviado' AND estado = 'finalizado'
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_participante (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
              rol TEXT NOT NULL CHECK (rol IN ('consultor', 'lider')),
              cedula TEXT NULL,
              email TEXT NULL,
              nombre TEXT NULL
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_seguimiento_part_cedula ON seguimiento_participante (cedula)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_seguimiento_part_acta ON seguimiento_participante (acta_id)
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_historial (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
              accion TEXT NOT NULL CHECK (accion IN (
                'crear', 'actualizar', 'finalizar', 'eliminar', 'restaurar', 'reintentar_correo'
              )),
              actor_user_id UUID NULL,
              actor_email TEXT NULL,
              actor_role TEXT NULL,
              diff_json JSONB NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
    }

    return { ensureSeguimientoTables };
}

module.exports = { createSeguimientoSchema };
