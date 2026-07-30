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

    // --- IDs visibles secuenciales (código de vacante y de ejecución/job) ---
    await runQuery(
        pool,
        logger,
        `CREATE SEQUENCE IF NOT EXISTS sourcing_vacante_codigo_seq;`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_vacantes ADD COLUMN IF NOT EXISTS codigo BIGINT NULL;`
    );
    // Backfill de vacantes sin código, en orden de creación, usando la secuencia.
    await runQuery(
        pool,
        logger,
        `DO $$
         DECLARE r RECORD;
         BEGIN
           FOR r IN SELECT id FROM sourcing_vacantes WHERE codigo IS NULL ORDER BY created_at, id LOOP
             UPDATE sourcing_vacantes SET codigo = nextval('sourcing_vacante_codigo_seq') WHERE id = r.id;
           END LOOP;
         END $$;`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_vacantes ALTER COLUMN codigo SET DEFAULT nextval('sourcing_vacante_codigo_seq');`
    );
    await runQuery(
        pool,
        logger,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sourcing_vacantes_codigo ON sourcing_vacantes (codigo);`
    );

    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_vacantes ADD COLUMN IF NOT EXISTS url_postulaciones_ee TEXT NULL;`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_vacantes ADD COLUMN IF NOT EXISTS texto_oferta TEXT NULL;`
    );

    // Código de ejecución (job) consecutivo por vacante.
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_jobs ADD COLUMN IF NOT EXISTS codigo INT NULL;`
    );
    await runQuery(
        pool,
        logger,
        `UPDATE sourcing_jobs j
         SET codigo = base.mx + s.rn
         FROM (
             SELECT id, vacante_id,
                    row_number() OVER (PARTITION BY vacante_id ORDER BY created_at, id) AS rn
             FROM sourcing_jobs WHERE codigo IS NULL
         ) s
         JOIN (
             SELECT vacante_id, COALESCE(MAX(codigo), 0) AS mx FROM sourcing_jobs GROUP BY vacante_id
         ) base ON base.vacante_id = s.vacante_id
         WHERE j.id = s.id;`
    );
    await runQuery(
        pool,
        logger,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sourcing_jobs_vacante_codigo ON sourcing_jobs (vacante_id, codigo);`
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

    // --- Campañas de contacto (selección de candidatos + estados de envío) ---
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_campanas (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nombre            TEXT NOT NULL,
            canal_default     TEXT NOT NULL DEFAULT 'auto'
                              CHECK (canal_default IN ('auto', 'whatsapp', 'inmail')),
            mensaje_plantilla TEXT NULL,
            estado            TEXT NOT NULL DEFAULT 'borrador'
                              CHECK (estado IN ('borrador', 'enviando', 'enviada', 'parcial', 'cancelada')),
            created_by        UUID NULL,
            vacante_id        UUID NULL REFERENCES sourcing_vacantes(id) ON DELETE SET NULL,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_campanas ADD COLUMN IF NOT EXISTS vacante_id UUID NULL REFERENCES sourcing_vacantes(id) ON DELETE SET NULL;`
    );
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_campana_destinatarios (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campana_id     UUID NOT NULL REFERENCES sourcing_campanas(id) ON DELETE CASCADE,
            candidato_id   UUID NULL REFERENCES sourcing_candidatos(id) ON DELETE SET NULL,
            nombre         TEXT NULL,
            canal          TEXT NOT NULL CHECK (canal IN ('whatsapp', 'inmail')),
            contacto       TEXT NULL,
            mensaje        TEXT NULL,
            estado         TEXT NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente', 'enviado', 'fallido')),
            error_mensaje  TEXT NULL,
            enviado_at     TIMESTAMPTZ NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_campana_dest_campana
         ON sourcing_campana_destinatarios (campana_id, estado);`
    );
    // Correo del destinatario (para altas manuales y contacto por email).
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_campana_destinatarios ADD COLUMN IF NOT EXISTS correo TEXT NULL;`
    );

    // Set de plantillas del agente (por fase) a nivel de campaña.
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_campanas ADD COLUMN IF NOT EXISTS plantillas JSONB NOT NULL DEFAULT '{}'::jsonb;`
    );

    // --- Preentrevista (estado conversacional del agente Contacto AT) ---
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_preentrevistas (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            destinatario_id UUID NULL REFERENCES sourcing_campana_destinatarios(id) ON DELETE SET NULL,
            campana_id     UUID NULL REFERENCES sourcing_campanas(id) ON DELETE SET NULL,
            candidato_id   UUID NULL REFERENCES sourcing_candidatos(id) ON DELETE SET NULL,
            telefono       TEXT NULL,
            fase           TEXT NOT NULL DEFAULT 'apertura'
                           CHECK (fase IN ('apertura','interes','oferta','ajuste','formulario','hv','agenda','cierre')),
            estado         TEXT NOT NULL DEFAULT 'en_curso'
                           CHECK (estado IN ('en_curso','interesado','no_disponible','completada','descartada','error')),
            interes        TEXT NULL,
            datos          JSONB NOT NULL DEFAULT '{}'::jsonb,
            cv_url         TEXT NULL,
            entrevista     JSONB NULL,
            base_conocimiento JSONB NULL,
            analista       TEXT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    // Columnas añadidas después de la creación original (idempotente para BD existentes).
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_preentrevistas
            ADD COLUMN IF NOT EXISTS base_conocimiento JSONB NULL,
            ADD COLUMN IF NOT EXISTS analista TEXT NULL,
            ADD COLUMN IF NOT EXISTS score INTEGER NULL,
            ADD COLUMN IF NOT EXISTS resumen_match TEXT NULL;`
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_preentrevistas_tel
         ON sourcing_preentrevistas (telefono);`
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_preentrevistas_dest
         ON sourcing_preentrevistas (destinatario_id);`
    );
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_preentrevista_mensajes (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            preentrevista_id UUID NOT NULL REFERENCES sourcing_preentrevistas(id) ON DELETE CASCADE,
            rol            TEXT NOT NULL CHECK (rol IN ('agente','candidato','sistema')),
            texto          TEXT NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_preentrevista_msgs
         ON sourcing_preentrevista_mensajes (preentrevista_id, created_at);`
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

    // Columnas adicionales candidatos (Zoho, salario)
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_candidatos
            ADD COLUMN IF NOT EXISTS zoho_id TEXT NULL,
            ADD COLUMN IF NOT EXISTS dias_inactivo TEXT NULL,
            ADD COLUMN IF NOT EXISTS estado_zoho TEXT NULL,
            ADD COLUMN IF NOT EXISTS salario_aspiracion TEXT NULL;`
    );

    // Tipo de job (búsqueda, postulaciones, rediscovery, publicar)
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_jobs ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'busqueda';`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_jobs ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;`
    );

    // Ampliar proveedores de integración (zoho_recruit)
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_integraciones DROP CONSTRAINT IF EXISTS sourcing_integraciones_provider_check;`
    );
    await runQuery(
        pool,
        logger,
        `ALTER TABLE sourcing_integraciones
            ADD CONSTRAINT sourcing_integraciones_provider_check
            CHECK (provider IN ('elempleo', 'linkedin', 'zoho_recruit'));`
    );

    // Decisiones para aprendizaje de scoring
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_decisiones_entrenamiento (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vacante_id      UUID NULL REFERENCES sourcing_vacantes(id) ON DELETE SET NULL,
            url_perfil      TEXT NULL,
            nombre          TEXT NULL,
            cargo_buscado   TEXT NULL,
            cargo_candidato TEXT NULL,
            ciudad          TEXT NULL,
            fuente          TEXT NULL,
            decision        TEXT NOT NULL CHECK (decision IN ('aprobado', 'rechazado')),
            score_ia        INTEGER NULL,
            resumen_ia      TEXT NULL,
            perfil_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by      UUID NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_decisiones_cargo
         ON sourcing_decisiones_entrenamiento (cargo_buscado, created_at DESC);`
    );

    // Publicaciones de vacante (El Empleo / LinkedIn)
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_publicaciones (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vacante_id      UUID NOT NULL REFERENCES sourcing_vacantes(id) ON DELETE CASCADE,
            canal           TEXT NOT NULL CHECK (canal IN ('elempleo', 'linkedin')),
            estado          TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'en_progreso', 'publicada', 'fallida')),
            url_publicada   TEXT NULL,
            texto_oferta    TEXT NULL,
            error_mensaje   TEXT NULL,
            payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by      UUID NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_publicaciones_vacante
         ON sourcing_publicaciones (vacante_id, canal, created_at DESC);`
    );

    // Flujos multi-paso (LinkedIn / secuencias outreach)
    await runQuery(
        pool,
        logger,
        `
        CREATE TABLE IF NOT EXISTS sourcing_flujos (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nombre          TEXT NOT NULL,
            descripcion     TEXT NULL,
            pasos_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
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
        CREATE TABLE IF NOT EXISTS sourcing_flujo_destinatarios (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            flujo_id            UUID NOT NULL REFERENCES sourcing_flujos(id) ON DELETE CASCADE,
            campana_id          UUID NULL REFERENCES sourcing_campanas(id) ON DELETE SET NULL,
            candidato_id        UUID NULL REFERENCES sourcing_candidatos(id) ON DELETE SET NULL,
            candidato_url       TEXT NULL,
            nombre              TEXT NULL,
            paso_actual         INTEGER NOT NULL DEFAULT 1,
            estado              TEXT NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente', 'ejecutado', 'respondio', 'completado', 'fallo')),
            fecha_ultimo_paso   TIMESTAMPTZ NULL,
            historial_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `
    );
    await runQuery(
        pool,
        logger,
        `CREATE INDEX IF NOT EXISTS idx_sourcing_flujo_dest_pendientes
         ON sourcing_flujo_destinatarios (flujo_id, estado, paso_actual);`
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
