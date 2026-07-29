function createActividadesStore({ pool }) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('createActividadesStore: pool es obligatorio.');
    }

    async function ensureActividadesConsultorTable() {
        // 1. Crear tabla si no existe
        await pool.query(`
            CREATE TABLE IF NOT EXISTS actividades_consultor (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cedula TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
                cliente TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                inicio TIMESTAMPTZ NOT NULL,
                fin TIMESTAMPTZ NULL,
                origen TEXT NOT NULL CHECK (origen IN ('manual', 'cronometro')),
                estado TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // 2. Migración garantizada para bases de datos existentes:
        // A. Actualizar registros existentes ('activa', etc.) a 'pendiente' ANTES de aplicar la restricción
        await pool.query(`
            UPDATE actividades_consultor
            SET estado = 'pendiente'
            WHERE estado NOT IN ('pendiente', 'aprobado', 'rechazado');
        `);

        // B. Cambiar el valor por defecto de la columna estado a 'pendiente'
        await pool.query(`
            ALTER TABLE actividades_consultor
            ALTER COLUMN estado SET DEFAULT 'pendiente';
        `);

        // C. Eliminar dinámicamente cualquier restricción CHECK preexistente asociada a la columna 'estado'
        await pool.query(`
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                FOR r IN
                    SELECT constraint_name
                    FROM information_schema.constraint_column_usage
                    WHERE table_name = 'actividades_consultor' AND column_name = 'estado'
                LOOP
                    EXECUTE 'ALTER TABLE actividades_consultor DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
                END LOOP;
            END $$;
        `);

        // D. Agregar la nueva restricción CHECK explícita para los tres estados del flujo
        await pool.query(`
            ALTER TABLE actividades_consultor
            DROP CONSTRAINT IF EXISTS chk_actividades_consultor_estado;
        `);
        await pool.query(`
            ALTER TABLE actividades_consultor
            ADD CONSTRAINT chk_actividades_consultor_estado
            CHECK (estado IN ('pendiente', 'aprobado', 'rechazado'));
        `);

        // E. Recrear índices condicionales sobre la columna estado
        await pool.query(`
            DROP INDEX IF EXISTS idx_actividades_consultor_listado;
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_actividades_consultor_listado
            ON actividades_consultor (cedula, inicio DESC)
            WHERE estado IN ('pendiente', 'aprobado', 'rechazado');
        `);

        await pool.query(`
            DROP INDEX IF EXISTS uq_actividad_cronometro_activo;
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_actividad_cronometro_activo
            ON actividades_consultor (cedula)
            WHERE origen = 'cronometro'
              AND fin IS NULL
              AND estado = 'pendiente';
        `);

        // F. Garantizar validación de hora fin posterior a inicio (idempotente)
        await pool.query(`
            ALTER TABLE actividades_consultor
            DROP CONSTRAINT IF EXISTS chk_actividad_fin_posterior;
        `);
        await pool.query(`
            ALTER TABLE actividades_consultor
            ADD CONSTRAINT chk_actividad_fin_posterior
            CHECK (fin IS NULL OR fin > inicio);
        `);
    }

    async function getConsultorContextByCedula(cedula) {
        const normalizedCedula = String(cedula || '').trim();
        if (!normalizedCedula) return null;

        const result = await pool.query(
            `SELECT cedula, cliente
             FROM colaboradores
             WHERE activo = TRUE AND cedula = $1
             LIMIT 1`,
            [normalizedCedula]
        );
        return result.rows[0] || null;
    }

    async function createManualActivity({ cedula, descripcion, inicio, fin }) {
        const context = await getConsultorContextByCedula(cedula);
        if (!context) return { kind: 'consultor_not_found' };

        const cliente = String(context.cliente || '').trim();
        if (!cliente) return { kind: 'client_not_assigned' };

        const result = await pool.query(
            `INSERT INTO actividades_consultor
                (cedula, cliente, descripcion, inicio, fin, origen, estado)
             VALUES ($1, $2, $3, $4, $5, 'manual', 'pendiente')
             RETURNING id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at`,
            [cedula, cliente, descripcion, inicio, fin]
        );
        return { kind: 'created', activity: result.rows[0] };
    }

    async function getActividadPropia({ id, cedula }) {
        const result = await pool.query(
            `SELECT id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at
             FROM actividades_consultor
             WHERE id = $1 AND cedula = $2 AND fin IS NOT NULL
             LIMIT 1`,
            [id, cedula]
        );
        return result.rows[0] || null;
    }

    async function updateActividadPropia({ id, cedula, descripcion, inicio, fin }) {
        const result = await pool.query(
            `UPDATE actividades_consultor
             SET descripcion = $3,
                 inicio = $4,
                 fin = $5,
                 updated_at = NOW()
             WHERE id = $1 AND cedula = $2 AND fin IS NOT NULL
             RETURNING id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at`,
            [id, cedula, descripcion, inicio, fin]
        );
        
        if (result.rowCount === 0) {
            return { kind: 'not_found' };
        }
        return { kind: 'updated', activity: result.rows[0] };
    }

    async function deleteActividadPropia({ id, cedula }) {
        const result = await pool.query(
            `DELETE FROM actividades_consultor
             WHERE id = $1 AND cedula = $2 AND fin IS NOT NULL
             RETURNING id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at`,
            [id, cedula]
        );
        
        if (result.rowCount === 0) {
            return { kind: 'not_found' };
        }
        return { kind: 'deleted', activity: result.rows[0] };
    }

    async function listActividadesByCedula(cedula) {
        const normalizedCedula = String(cedula || '').trim();
        if (!normalizedCedula) return [];

        const result = await pool.query(
            `SELECT id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at
             FROM actividades_consultor
             WHERE cedula = $1 AND estado IN ('pendiente', 'aprobado', 'rechazado') AND fin IS NOT NULL
             ORDER BY inicio DESC`,
            [normalizedCedula]
        );
        return result.rows;
    }

    /**
     * Permite actualizar el estado de una actividad (aprobado / rechazado / pendiente).
     * Preparado para el flujo de gestión del portal Administrador.
     */
    async function updateActividadEstado({ id, estado }) {
        const normalizedId = String(id || '').trim();
        const normalizedEstado = String(estado || '').trim().toLowerCase();

        if (!['pendiente', 'aprobado', 'rechazado'].includes(normalizedEstado)) {
            return { kind: 'invalid_estado' };
        }

        const result = await pool.query(
            `UPDATE actividades_consultor
             SET estado = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at`,
            [normalizedId, normalizedEstado]
        );

        if (result.rowCount === 0) {
            return { kind: 'not_found' };
        }

        return { kind: 'updated', activity: result.rows[0] };
    }

    async function getCronometroActivoByCedula(cedula) {
        const normalizedCedula = String(cedula || '').trim();
        if (!normalizedCedula) return null;

        const result = await pool.query(
            `SELECT id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at
             FROM actividades_consultor
             WHERE cedula = $1 AND origen = 'cronometro' AND fin IS NULL
             LIMIT 1`,
            [normalizedCedula]
        );
        return result.rows[0] || null;
    }

    async function iniciarCronometro({ cedula, descripcion }) {
        const context = await getConsultorContextByCedula(cedula);
        if (!context) return { kind: 'consultor_not_found' };

        const cliente = String(context.cliente || '').trim();
        if (!cliente) return { kind: 'client_not_assigned' };

        const trimmedDesc = String(descripcion || '').trim();
        if (!trimmedDesc) return { kind: 'description_required' };

        try {
            const result = await pool.query(
                `INSERT INTO actividades_consultor
                    (cedula, cliente, descripcion, inicio, fin, origen, estado)
                 VALUES ($1, $2, $3, NOW(), NULL, 'cronometro', 'pendiente')
                 RETURNING id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at`,
                [cedula, cliente, trimmedDesc]
            );
            return { kind: 'started', activity: result.rows[0] };
        } catch (error) {
            if (error && error.code === '23505') {
                return { kind: 'already_active' };
            }
            throw error;
        }
    }

    async function detenerCronometro({ cedula }) {
        const normalizedCedula = String(cedula || '').trim();
        if (!normalizedCedula) return { kind: 'consultor_not_found' };

        const result = await pool.query(
            `UPDATE actividades_consultor
             SET fin = NOW(), updated_at = NOW()
             WHERE cedula = $1 AND origen = 'cronometro' AND fin IS NULL
             RETURNING id, cedula, cliente, descripcion, inicio, fin, origen, estado, created_at, updated_at`,
            [normalizedCedula]
        );

        if (result.rowCount === 0) {
            return { kind: 'no_active_timer' };
        }

        return { kind: 'stopped', activity: result.rows[0] };
    }

    async function cancelarCronometro({ cedula }) {
        const normalizedCedula = String(cedula || '').trim();
        if (!normalizedCedula) return { kind: 'consultor_not_found' };

        const result = await pool.query(
            `DELETE FROM actividades_consultor
             WHERE cedula = $1 AND origen = 'cronometro' AND fin IS NULL
             RETURNING id`,
            [normalizedCedula]
        );

        if (result.rowCount === 0) {
            return { kind: 'no_active_timer' };
        }

        return { kind: 'cancelled' };
    }

    return {
        ensureActividadesConsultorTable,
        getConsultorContextByCedula,
        createManualActivity,
        getActividadPropia,
        updateActividadPropia,
        deleteActividadPropia,
        listActividadesByCedula,
        updateActividadEstado,
        getCronometroActivoByCedula,
        iniciarCronometro,
        detenerCronometro,
        cancelarCronometro
    };
}

module.exports = { createActividadesStore };
