/**
 * DDL idempotente del módulo Atracción de Talento (sourcing).
 * Cargado desde `src/startup.js` → `ensureSourcingSchema({ pool, logger })`.
 */

function isIgnorableDdlError(error) {
    const code = String(error && error.code || '');
    // 42710 duplicate_object, 42P16 invalid_table_definition (ej. índice ya existe con otra definición)
    return code === '42710' || code === '42P16';
}

function logWarn(logger, msg) {
    if (logger && typeof logger.warn === 'function') logger.warn(msg);
    else console.warn(`[Sourcing] ${msg}`);
}

function logInfo(logger, msg) {
    if (logger && typeof logger.info === 'function') logger.info(msg);
    else console.info(`[Sourcing] ${msg}`);
}

async function runQuery(pool, logger, sql) {
    try {
        await pool.query(sql);
    } catch (e) {
        if (isIgnorableDdlError(e)) {
            logWarn(logger, `DDL omitido (${e.code}): ${e.message || e}`);
            return;
        }
        throw e;
    }
}

/**
 * @param {{ pool: import('pg').Pool, logger?: object }} deps
 */
async function ensureSourcingSchema({ pool, logger } = {}) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('ensureSourcingSchema requiere `pool` válido.');
    }

    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_vacantes (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            titulo          TEXT NULL,
            descripcion     TEXT NOT NULL,
            criterios       JSONB NOT NULL DEFAULT '{}'::jsonb,
            estado          TEXT NOT NULL DEFAULT 'borrador'
                            CHECK (estado IN ('borrador', 'activa', 'cerrada', 'archivada')),
            created_by      UUID NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );

    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_jobs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vacante_id      UUID NOT NULL REFERENCES sourcing_vacantes(id) ON DELETE CASCADE,
            estado          TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'en_progreso', 'parcial', 'completado', 'fallido', 'cancelado')),
            fase            TEXT NOT NULL DEFAULT 'descubrimiento'
                            CHECK (fase IN ('descubrimiento', 'extraccion', 'enriquecimiento', 'scoring', 'completado')),
            fuentes         JSONB NOT NULL DEFAULT '{"elempleo":true,"linkedin":false,"xray":false}'::jsonb,
            progreso        JSONB NOT NULL DEFAULT '{}'::jsonb,
            error_mensaje   TEXT NULL,
            created_by      UUID NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );

    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_candidatos (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id          UUID NOT NULL REFERENCES sourcing_jobs(id) ON DELETE CASCADE,
            vacante_id      UUID NOT NULL REFERENCES sourcing_vacantes(id) ON DELETE CASCADE,
            fuente          TEXT NOT NULL,
            url_perfil      TEXT NULL,
            nombre          TEXT NULL,
            perfil          JSONB NOT NULL DEFAULT '{}'::jsonb,
            etapa           TEXT NOT NULL DEFAULT 'descubrimiento'
                            CHECK (etapa IN ('descubrimiento', 'extraccion', 'enriquecimiento', 'scoring', 'completo')),
            enriquecido     BOOLEAN NOT NULL DEFAULT false,
            score           INTEGER NULL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
            resumen_score   TEXT NULL,
            decision        TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (decision IN ('pendiente', 'aprobado', 'rechazado')),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );

    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_jobs ADD COLUMN IF NOT EXISTS fase TEXT NOT NULL DEFAULT 'descubrimiento';`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_candidatos ADD COLUMN IF NOT EXISTS etapa TEXT NOT NULL DEFAULT 'descubrimiento';`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_candidatos ADD COLUMN IF NOT EXISTS enriquecido BOOLEAN NOT NULL DEFAULT false;`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_candidatos ADD COLUMN IF NOT EXISTS resumee_id TEXT NULL;`
    );

    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_integraciones (
            provider        TEXT PRIMARY KEY
                            CHECK (provider IN ('elempleo', 'linkedin')),
            estado          TEXT NOT NULL DEFAULT 'desconectado'
                            CHECK (estado IN ('desconectado', 'conectando', 'conectado', 'expirado', 'error')),
            cookies_enc     TEXT NULL,
            mensaje         TEXT NULL,
            connected_by    UUID NULL,
            connected_at    TIMESTAMPTZ NULL,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );

    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_integraciones_estado ON sourcing_integraciones (estado);`
    );

    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_jobs_vacante ON sourcing_jobs (vacante_id, created_at DESC);`
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_candidatos_job ON sourcing_candidatos (job_id, score DESC NULLS LAST);`
    );
    await runQuery(
        pool,
        logger,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sourcing_candidatos_dedup
         ON sourcing_candidatos (job_id, fuente, COALESCE(url_perfil, ''), COALESCE(nombre, ''));`
    );
    await runQuery(
        pool,
        logger,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sourcing_candidatos_vacante_resumee
         ON sourcing_candidatos (vacante_id, fuente, resumee_id)
         WHERE resumee_id IS NOT NULL AND resumee_id <> '';`
    );

    const check = await pool.query(
        `SELECT to_regclass('public.sourcing_vacantes') AS vacantes,
                to_regclass('public.sourcing_jobs') AS jobs,
                to_regclass('public.sourcing_candidatos') AS candidatos`
    );
    const row = check.rows[0] || {};
    if (!row.vacantes || !row.jobs || !row.candidatos) {
        throw new Error(
            'Esquema sourcing incompleto: faltan tablas sourcing_vacantes/jobs/candidatos. '
            + 'Ejecute logs/ensure-sourcing-schema.js con un rol con permisos DDL.'
        );
    }

    logInfo(logger, 'Esquema sourcing (atracción de talento) listo (idempotente).');
}

module.exports = { ensureSourcingSchema };
