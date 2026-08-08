/**
 * DDL idempotente del módulo "Onboarding" (maestro de personal + tablas satélite + puente Dynamo).
 *
 * Diseño:
 *  - No reemplaza ninguna tabla existente. Solo extiende `colaboradores` con columnas nuevas
 *    (ALTER TABLE ADD COLUMN IF NOT EXISTS) y CREA tablas satélite + catálogos + buzón staging.
 *  - Todas las funciones envuelven errores 42501 (permiso insuficiente) y 42710 (objeto duplicado)
 *    para no romper el arranque del backend si la BD no es owner.
 *  - Vistas `v_colaboradores_activos` y `v_colaboradores_bajas` para consumidores de solo lectura.
 *
 * Cargado desde `src/startup.js` → `ensureOnboardingSchema({ pool, logger })`.
 */

/** Motivos legales de baja (hoja Rotación del Excel CONTROL CONTRATOS). */
const CAT_MOTIVO_BAJA_SEMILLA = [
    'Renuncia Voluntaria',
    'Termino de la Obra o Labor',
    'Termino de Contrato',
    'Absorción',
    'Termino de Servicio',
    'Periodo de Prueba',
    'Mutuo Acuerdo',
    'Notificación Termino de Servicio'
];

/** Permite errores idempotentes / sin privilegios sin tumbar el arranque. */
function isIgnorableDdlError(error) {
    const code = String(error && error.code || '');
    return code === '42501' || code === '42710' || code === '42P16';
}

function logWarn(logger, msg) {
    if (logger && typeof logger.warn === 'function') {
        logger.warn(msg);
    } else {
        console.warn(`[Onboarding] ${msg}`);
    }
}

function logInfo(logger, msg) {
    if (logger && typeof logger.info === 'function') {
        logger.info(msg);
    } else {
        console.info(`[Onboarding] ${msg}`);
    }
}

/**
 * Crea/extiende todo el esquema de onboarding. Idempotente.
 * @param {{ pool: import('pg').Pool, logger?: any }} deps
 */
async function ensureOnboardingSchema({ pool, logger } = {}) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('ensureOnboardingSchema requiere `pool` válido.');
    }

    await ensureColaboradoresOnboardingColumns({ pool, logger });
    await ensureColaboradoresViews({ pool, logger });
    await ensureCatMotivoBajaTable({ pool, logger });
    await ensureCatCiudadesTable({ pool, logger });
    await ensureCatAfiliacionesTables({ pool, logger });
    await ensureOnboardingStagingTable({ pool, logger });
    await ensureFichaNovedadesStagingTable({ pool, logger });
    await ensureEtlExcelLogTable({ pool, logger });
    await ensureColaboradorCalculoSalarialTable({ pool, logger });
    await ensureColaboradorLicenciasMaternidadTable({ pool, logger });
    await ensureColaboradorDocumentosExtranjerosTable({ pool, logger });
    await ensureColaboradorPolizasInternacionalesTable({ pool, logger });
    await ensureColaboradorCapacitacionesTable({ pool, logger });
    await ensurePersonasExternasHeadhuntingTable({ pool, logger });
    await ensureDynamoStreamCheckpointTable({ pool, logger });

    logInfo(logger, 'Esquema onboarding listo (idempotente).');
}

/**
 * Extiende `colaboradores` con columnas: tipo_personal, baja, SENA, ALIANZA y puente Dynamo.
 * Solo ALTER TABLE ADD COLUMN IF NOT EXISTS. No rompe consumidores existentes.
 */
async function ensureColaboradoresOnboardingColumns({ pool, logger }) {
    /**
     * Cada entry = una columna nueva en `colaboradores`. Si ya existe (caso de re-arranque o
     * que un dataLayer previo la haya creado), `IF NOT EXISTS` la ignora.
     */
    const columns = [
        // Clasificación del personal — discriminador del maestro único
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS tipo_personal TEXT NOT NULL DEFAULT 'consultor'` },
        // SENA (lectiva / productiva) → mismo maestro
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS subtipo_sena TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS area_asignada_sena TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS fecha_inicio_lectiva DATE NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS fecha_inicio_productiva DATE NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS fecha_fin_practica DATE NULL` },
        // Bajas → mismo maestro con activo=FALSE + causales
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS motivo_baja TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS termino TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS tiempo_permanencia_meses NUMERIC(10,2) NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS fecha_baja_efectiva DATE NULL` },
        // ALIANZA (hoja del Excel) → mismo maestro
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS iva NUMERIC(18,2) NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS sueldo_facturas NUMERIC(18,2) NULL` },
        // Puente Dynamo n8n → Postgres
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS dynamo_external_id TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS onboarding_status TEXT NULL` },
        { sql: `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL` }
    ];

    for (const col of columns) {
        try {
            await pool.query(col.sql);
        } catch (error) {
            if (isIgnorableDdlError(error)) {
                logWarn(logger, `Permiso insuficiente o duplicado al ejecutar: ${col.sql}`);
                continue;
            }
            throw error;
        }
    }

    /**
     * CHECK constraint del tipo_personal. Se intenta crear; si ya existe (42710) o si la BD no
     * permite ADD CONSTRAINT (42501) se ignora — la regla queda como guía de aplicación.
     */
    try {
        await pool.query(`
            ALTER TABLE colaboradores
            ADD CONSTRAINT chk_colaboradores_tipo_personal
            CHECK (tipo_personal IN ('consultor', 'staff', 'sena', 'alianza'))
        `);
    } catch (error) {
        if (!isIgnorableDdlError(error)) throw error;
    }

    // Índices funcionales y de búsqueda
    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_colaboradores_tipo_personal ON colaboradores(tipo_personal)`,
        `CREATE INDEX IF NOT EXISTS idx_colaboradores_whatsapp_number ON colaboradores(whatsapp_number) WHERE whatsapp_number IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_colaboradores_dynamo_ext_id ON colaboradores(dynamo_external_id) WHERE dynamo_external_id IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_colaboradores_motivo_baja ON colaboradores(motivo_baja) WHERE motivo_baja IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_colaboradores_fecha_baja ON colaboradores(fecha_baja_efectiva) WHERE fecha_baja_efectiva IS NOT NULL`
    ];
    for (const sql of indexes) {
        try {
            await pool.query(sql);
        } catch (error) {
            if (isIgnorableDdlError(error)) continue;
            throw error;
        }
    }
}

/** Vistas de lectura: activos vs bajas + rotación calculada. Reduce duplicación en módulos consumidores. */
async function ensureColaboradoresViews({ pool, logger }) {
    const views = [
        `CREATE OR REPLACE VIEW v_colaboradores_activos AS
         SELECT * FROM colaboradores WHERE activo = TRUE`,
        `CREATE OR REPLACE VIEW v_colaboradores_bajas AS
         SELECT * FROM colaboradores
         WHERE activo = FALSE
            OR motivo_baja IS NOT NULL
            OR fecha_baja_efectiva IS NOT NULL`,
        `CREATE OR REPLACE VIEW v_colaboradores_consultores_activos AS
         SELECT * FROM colaboradores
         WHERE activo = TRUE AND tipo_personal = 'consultor'`,
        /**
         * Reporte de rotación. Reemplaza la hoja "Rotación" del Excel.
         * Una fila por (cliente, motivo, mes_baja). El frontend agrega los totales que necesite.
         */
        `CREATE OR REPLACE VIEW v_rotacion_mes_cliente_motivo AS
         SELECT
             TRIM(c.cliente)                            AS cliente,
             COALESCE(c.tipo_personal, 'consultor')     AS tipo_personal,
             to_char(c.fecha_baja_efectiva, 'YYYY-MM')  AS mes_baja,
             COALESCE(c.motivo_baja, 'Sin motivo')      AS motivo,
             COUNT(*)::int                              AS cuenta,
             ROUND(AVG(c.tiempo_permanencia_meses)::numeric, 2) AS permanencia_avg_meses
         FROM colaboradores c
         WHERE c.motivo_baja IS NOT NULL
            OR c.fecha_baja_efectiva IS NOT NULL
            OR c.activo = FALSE
         GROUP BY 1, 2, 3, 4`
    ];
    for (const sql of views) {
        try {
            await pool.query(sql);
        } catch (error) {
            if (isIgnorableDdlError(error)) {
                logWarn(logger, 'Permisos insuficientes para crear vista de colaboradores.');
                continue;
            }
            throw error;
        }
    }
}

/** Catálogo de motivos legales de baja con semilla idempotente. */
async function ensureCatMotivoBajaTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cat_motivo_baja (
                id SERIAL PRIMARY KEY,
                motivo TEXT NOT NULL UNIQUE,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                orden SMALLINT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        for (let i = 0; i < CAT_MOTIVO_BAJA_SEMILLA.length; i += 1) {
            await pool.query(
                `INSERT INTO cat_motivo_baja (motivo, orden, activo)
                 VALUES ($1, $2, TRUE)
                 ON CONFLICT (motivo) DO NOTHING`,
                [CAT_MOTIVO_BAJA_SEMILLA[i], i]
            );
        }
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para cat_motivo_baja.');
            return;
        }
        throw error;
    }
}

/** Catálogo de ciudades (semilla por ETL del Excel; aquí solo se crea la tabla). */
async function ensureCatCiudadesTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cat_ciudades (
                id SERIAL PRIMARY KEY,
                ciudad TEXT NOT NULL,
                pais TEXT NOT NULL DEFAULT 'Colombia',
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_cat_ciudades_pais_ciudad UNIQUE (pais, ciudad)
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_cat_ciudades_pais ON cat_ciudades(pais)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para cat_ciudades.');
            return;
        }
        throw error;
    }
}

/**
 * Catálogos auxiliares (EPS / AFP / ARL / CCF / Cesantías). No son FK duras: sirven para
 * poblar dropdowns en el frontend. La columna libre en `colaboradores.eps`/`afp`/etc se mantiene.
 */
async function ensureCatAfiliacionesTables({ pool, logger }) {
    const tables = ['cat_eps', 'cat_afp', 'cat_arl', 'cat_ccf', 'cat_cesantias'];
    for (const tbl of tables) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ${tbl} (
                    id SERIAL PRIMARY KEY,
                    nombre TEXT NOT NULL UNIQUE,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);
        } catch (error) {
            if (isIgnorableDdlError(error)) {
                logWarn(logger, `Permisos insuficientes para ${tbl}.`);
                continue;
            }
            throw error;
        }
    }
}

/**
 * Buzón crudo de eventos antes de promover a `colaboradores`. Idempotencia por UNIQUE
 * `(source, external_id, event_type, sequence_number)`.
 */
async function ensureOnboardingStagingTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS onboarding_staging (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source TEXT NOT NULL,
                external_id TEXT NULL,
                event_type TEXT NOT NULL DEFAULT 'INSERT',
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT NOT NULL DEFAULT 'recibido',
                cedula_resultante TEXT NULL,
                error TEXT NULL,
                sequence_number TEXT NULL,
                shard_id TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at TIMESTAMPTZ NULL,
                CONSTRAINT chk_onboarding_staging_source CHECK (
                    source IN ('dynamo_stream', 'n8n_webhook', 'excel_etl', 'manual')
                ),
                CONSTRAINT chk_onboarding_staging_status CHECK (
                    status IN ('recibido', 'aplicado', 'rechazado', 'requiere_revision')
                )
            )
        `);
        // UNIQUE compuesto. Cuando sequence_number es NULL (webhook / manual / etl),
        // PostgreSQL trata NULL como distinto, así que NO hay falsos duplicados:
        // dos webhooks consecutivos con mismo external_id siguen permitidos (re-procesables).
        // El servicio promote* desduplica en aplicación cuando hace falta.
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_staging_natural
            ON onboarding_staging (source, external_id, event_type, sequence_number)
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_onboarding_staging_status ON onboarding_staging(status)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_onboarding_staging_created ON onboarding_staging(created_at DESC)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_onboarding_staging_cedula ON onboarding_staging(cedula_resultante) WHERE cedula_resultante IS NOT NULL');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para onboarding_staging.');
            return;
        }
        throw error;
    }
}

/**
 * Buzón de revisión para novedades Zoho (parches a colaboradores ya ingresados).
 * Separado de `onboarding_staging` — semántica distinta (diff + aprobación CH).
 */
async function ensureFichaNovedadesStagingTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ficha_novedades_staging (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source TEXT NOT NULL DEFAULT 'dynamo_stream_zoho',
                external_id TEXT NOT NULL,
                event_type TEXT NOT NULL DEFAULT 'INSERT',
                tipo_novedad TEXT NOT NULL,
                id_registro TEXT NULL,
                subject TEXT NULL,
                received_at TIMESTAMPTZ NULL,
                payload_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
                payload_normalizado JSONB NOT NULL DEFAULT '{}'::jsonb,
                diff_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                status TEXT NOT NULL DEFAULT 'pendiente',
                cedula_detectada TEXT NULL,
                colaborador_cedula_match TEXT NULL,
                colaborador_nombre_snap TEXT NULL,
                reviewed_by TEXT NULL,
                reviewed_at TIMESTAMPTZ NULL,
                error TEXT NULL,
                sequence_number TEXT NULL,
                shard_id TEXT NULL,
                n8n_execution_id TEXT NULL,
                match_strategy TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at TIMESTAMPTZ NULL,
                CONSTRAINT chk_ficha_novedades_source CHECK (
                    source IN ('dynamo_stream_zoho', 'n8n_webhook', 'manual')
                ),
                CONSTRAINT chk_ficha_novedades_status CHECK (
                    status IN ('pendiente', 'aplicado', 'rechazado', 'sin_match')
                )
            )
        `);
        await pool.query(`
            DROP INDEX IF EXISTS uq_ficha_novedades_external
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_ficha_novedades_source_external_event
            ON ficha_novedades_staging (
                source,
                external_id,
                event_type,
                COALESCE(sequence_number, ''),
                COALESCE(shard_id, '')
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_ficha_novedades_external_id
            ON ficha_novedades_staging (external_id)
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_ficha_novedades_status ON ficha_novedades_staging(status)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_ficha_novedades_tipo ON ficha_novedades_staging(tipo_novedad)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_ficha_novedades_created ON ficha_novedades_staging(created_at DESC)');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_ficha_novedades_cedula_match
            ON ficha_novedades_staging(colaborador_cedula_match)
            WHERE colaborador_cedula_match IS NOT NULL
        `);
        await pool.query(`
            ALTER TABLE ficha_novedades_staging
            ADD COLUMN IF NOT EXISTS match_strategy TEXT NULL
        `);
        try {
            await pool.query(`
                ALTER TABLE ficha_novedades_staging
                DROP CONSTRAINT IF EXISTS chk_ficha_novedades_source
            `);
            await pool.query(`
                ALTER TABLE ficha_novedades_staging
                ADD CONSTRAINT chk_ficha_novedades_source
                CHECK (source IN ('dynamo_stream_zoho', 'n8n_webhook', 'manual'))
            `);
        } catch (constraintErr) {
            logWarn(logger, 'No se pudo actualizar chk_ficha_novedades_source (puede requerir permisos DDL).');
        }
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para ficha_novedades_staging.');
            return;
        }
        throw error;
    }
}

/** Bitácora del ETL one-shot del Excel. Sirve para debug y conteo de éxito/error por hoja. */
async function ensureEtlExcelLogTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS etl_excel_log (
                id BIGSERIAL PRIMARY KEY,
                run_id UUID NOT NULL,
                hoja TEXT NOT NULL,
                fila_excel INTEGER NULL,
                nivel TEXT NOT NULL DEFAULT 'info',
                accion TEXT NULL,
                cedula TEXT NULL,
                mensaje TEXT NULL,
                payload JSONB NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT chk_etl_excel_log_nivel CHECK (nivel IN ('info', 'warning', 'error'))
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_etl_excel_log_run ON etl_excel_log(run_id, hoja)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_etl_excel_log_nivel ON etl_excel_log(nivel)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para etl_excel_log.');
            return;
        }
        throw error;
    }
}

/**
 * Calculadora salarial 1:1 por cédula vigente. Los campos `calculo_*` se derivan en
 * trigger BEFORE INSERT/UPDATE (utilidad, RT/aprox, valores totales con % ajuste).
 *
 * Nota: `updated_by_user_id` se modela como UUID sin FK explícito a `users(id)`
 * porque el rol de aplicación puede carecer del permiso `REFERENCES` sobre `users`,
 * lo cual abortaba la creación de toda la tabla. La integridad referencial se
 * preserva a nivel de aplicación (el endpoint PUT valida que el usuario exista).
 */
async function ensureColaboradorCalculoSalarialTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_calculo_salarial (
                cedula TEXT PRIMARY KEY REFERENCES colaboradores(cedula) ON DELETE CASCADE,
                costo_empresa NUMERIC(18,2) NULL,
                tarifa_cliente NUMERIC(18,2) NULL,
                utilidad NUMERIC(18,2) NULL,
                rt_aprox NUMERIC(10,4) NULL,
                pct_ajuste_salario NUMERIC(10,4) NOT NULL DEFAULT 0,
                valor_total_salario NUMERIC(18,2) NULL,
                pct_ajuste_tarifa NUMERIC(10,4) NOT NULL DEFAULT 0,
                valor_total_tarifa NUMERIC(18,2) NULL,
                calculo_costo_empresa NUMERIC(18,2) NULL,
                calculo_utilidad NUMERIC(18,2) NULL,
                calculo_rentabilidad NUMERIC(10,4) NULL,
                moneda TEXT NOT NULL DEFAULT 'COP',
                periodicidad_pago TEXT NULL,
                vigente_desde DATE NULL,
                vigente_hasta DATE NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_by_user_id UUID NULL
            )
        `);
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, `Permisos insuficientes al crear tabla colaborador_calculo_salarial: ${error.message}`);
            return;
        }
        throw error;
    }

    try {
        await pool.query(`
            CREATE OR REPLACE FUNCTION fn_colaborador_calculo_salarial_derive()
            RETURNS TRIGGER AS $body$
            BEGIN
                NEW.updated_at := NOW();
                /* utilidad = tarifa - costo */
                IF NEW.tarifa_cliente IS NOT NULL AND NEW.costo_empresa IS NOT NULL THEN
                    NEW.utilidad := NEW.tarifa_cliente - NEW.costo_empresa;
                    IF NEW.tarifa_cliente > 0 THEN
                        NEW.rt_aprox := ROUND((NEW.utilidad / NEW.tarifa_cliente)::numeric, 4);
                    END IF;
                END IF;
                /* valor con % ajuste */
                IF NEW.costo_empresa IS NOT NULL THEN
                    NEW.valor_total_salario := ROUND(
                        (NEW.costo_empresa * (1 + COALESCE(NEW.pct_ajuste_salario, 0)))::numeric, 2
                    );
                END IF;
                IF NEW.tarifa_cliente IS NOT NULL THEN
                    NEW.valor_total_tarifa := ROUND(
                        (NEW.tarifa_cliente * (1 + COALESCE(NEW.pct_ajuste_tarifa, 0)))::numeric, 2
                    );
                END IF;
                /* cálculo con ajuste */
                IF NEW.valor_total_tarifa IS NOT NULL AND NEW.valor_total_salario IS NOT NULL THEN
                    NEW.calculo_costo_empresa := NEW.valor_total_salario;
                    NEW.calculo_utilidad := NEW.valor_total_tarifa - NEW.valor_total_salario;
                    IF NEW.valor_total_tarifa > 0 THEN
                        NEW.calculo_rentabilidad := ROUND(
                            (NEW.calculo_utilidad / NEW.valor_total_tarifa)::numeric, 4
                        );
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $body$ LANGUAGE plpgsql;
        `);
    } catch (error) {
        if (!isIgnorableDdlError(error)) throw error;
        logWarn(logger, `No se pudo crear/actualizar fn_colaborador_calculo_salarial_derive: ${error.message}`);
    }

    try {
        await pool.query(`DROP TRIGGER IF EXISTS trg_colab_calc_salarial_derive ON colaborador_calculo_salarial`);
        await pool.query(`
            CREATE TRIGGER trg_colab_calc_salarial_derive
            BEFORE INSERT OR UPDATE ON colaborador_calculo_salarial
            FOR EACH ROW EXECUTE FUNCTION fn_colaborador_calculo_salarial_derive()
        `);
    } catch (error) {
        if (!isIgnorableDdlError(error)) throw error;
        logWarn(logger, `No se pudo crear trigger trg_colab_calc_salarial_derive: ${error.message}`);
    }
}

/** Licencias maternidad / paternidad / lactancia — varias por cédula. */
async function ensureColaboradorLicenciasMaternidadTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_licencias_maternidad (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cedula TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE RESTRICT,
                cliente TEXT NULL,
                tipo_licencia TEXT NOT NULL DEFAULT 'maternidad',
                meses_gestacion NUMERIC(4,1) NULL,
                parto_fecha_aproximada DATE NULL,
                inicio_licencia DATE NULL,
                fin_licencia DATE NULL,
                eps TEXT NULL,
                observaciones TEXT NULL,
                estado TEXT NOT NULL DEFAULT 'abierta',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT chk_lic_mat_tipo CHECK (tipo_licencia IN ('maternidad', 'paternidad', 'lactancia')),
                CONSTRAINT chk_lic_mat_estado CHECK (estado IN ('abierta', 'cerrada'))
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_lic_mat_cedula ON colaborador_licencias_maternidad(cedula)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_lic_mat_inicio ON colaborador_licencias_maternidad(inicio_licencia)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_lic_mat_parto ON colaborador_licencias_maternidad(parto_fecha_aproximada)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para colaborador_licencias_maternidad.');
            return;
        }
        throw error;
    }
}

/** Trámites migratorios (SIRE / RUTEC / PPT) — 1:1 por cédula. */
async function ensureColaboradorDocumentosExtranjerosTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_documentos_extranjeros (
                cedula TEXT PRIMARY KEY REFERENCES colaboradores(cedula) ON DELETE CASCADE,
                lugar_nacimiento TEXT NULL,
                tipo_identificacion TEXT NULL,
                numero_identidad TEXT NULL,
                motivo TEXT NULL,
                fecha_vencimiento DATE NULL,
                registro_sire BOOLEAN NULL,
                registro_rutec BOOLEAN NULL,
                vigencia_renovar DATE NULL,
                no_contrato TEXT NULL,
                estado_documento TEXT NULL,
                observaciones TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_doc_ext_vencimiento ON colaborador_documentos_extranjeros(fecha_vencimiento)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_doc_ext_vigencia ON colaborador_documentos_extranjeros(vigencia_renovar)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para colaborador_documentos_extranjeros.');
            return;
        }
        throw error;
    }
}

/** Pólizas internacionales (viajes) — n por cédula. */
async function ensureColaboradorPolizasInternacionalesTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_polizas_internacionales (
                id BIGSERIAL PRIMARY KEY,
                cedula TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
                cliente_proyecto TEXT NULL,
                fecha_salida DATE NULL,
                fecha_retorno DATE NULL,
                ciudad_pais_viaje TEXT NULL,
                contacto_emergencia TEXT NULL,
                telefono TEXT NULL,
                numero_poliza TEXT NULL,
                estado TEXT NOT NULL DEFAULT 'Activa',
                observaciones TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_polizas_cedula ON colaborador_polizas_internacionales(cedula)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_polizas_salida ON colaborador_polizas_internacionales(fecha_salida)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_polizas_estado ON colaborador_polizas_internacionales(estado)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para colaborador_polizas_internacionales.');
            return;
        }
        throw error;
    }
}

/** Capacitaciones financiadas — n por cédula. */
async function ensureColaboradorCapacitacionesTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_capacitaciones (
                id BIGSERIAL PRIMARY KEY,
                cedula TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
                cliente_proyecto TEXT NULL,
                curso TEXT NOT NULL,
                centro TEXT NULL,
                fecha DATE NULL,
                costo NUMERIC(18,2) NULL,
                moneda TEXT NOT NULL DEFAULT 'COP',
                area_que_financia TEXT NULL,
                observaciones TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_capac_cedula ON colaborador_capacitaciones(cedula)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_capac_fecha ON colaborador_capacitaciones(fecha)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_capac_area ON colaborador_capacitaciones(area_que_financia)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para colaborador_capacitaciones.');
            return;
        }
        throw error;
    }
}

/**
 * Headhunting: colocaciones en cliente externo. NO son empleados CINTE, por eso NO van a
 * `colaboradores`. Tabla independiente.
 */
async function ensurePersonasExternasHeadhuntingTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS personas_externas_headhunting (
                id BIGSERIAL PRIMARY KEY,
                nombres_apellidos TEXT NOT NULL,
                pais TEXT NULL,
                cliente TEXT NULL,
                reclutador TEXT NULL,
                ejecutiva TEXT NULL,
                fecha_inicio DATE NULL,
                valor_a_facturar NUMERIC(18,2) NULL,
                moneda TEXT NOT NULL DEFAULT 'COP',
                cargo_rol TEXT NULL,
                proyecto TEXT NULL,
                lider TEXT NULL,
                direccion TEXT NULL,
                correo_lider TEXT NULL,
                observaciones TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_hh_cliente ON personas_externas_headhunting(cliente)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_hh_fecha ON personas_externas_headhunting(fecha_inicio)');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para personas_externas_headhunting.');
            return;
        }
        throw error;
    }
}

/**
 * Checkpoint opcional para reanudar el StreamPoller sin perder eventos tras caídas.
 * Solo se usa cuando se decide cambiar el ShardIteratorType del poller a AFTER_SEQUENCE_NUMBER.
 */
async function ensureDynamoStreamCheckpointTable({ pool, logger }) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dynamo_stream_checkpoint (
                shard_id TEXT PRIMARY KEY,
                last_sequence_number TEXT NULL,
                table_name TEXT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para dynamo_stream_checkpoint.');
            return;
        }
        throw error;
    }
}



// Agregar esta función al final del archivo
async function ensureReubicacionesSchema({ pool, logger }) {
    try {
        // 1. Extender reubicaciones_pipeline
        await pool.query(`
            ALTER TABLE public.reubicaciones_pipeline 
            ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'Pendiente',
            ADD COLUMN IF NOT EXISTS motivo_novedad TEXT,
            ADD COLUMN IF NOT EXISTS tipo_ficha VARCHAR(20),
            ADD COLUMN IF NOT EXISTS ultimo_evento_id TEXT,
            ADD COLUMN IF NOT EXISTS gp_asignado_id UUID,
            ADD COLUMN IF NOT EXISTS alerta_extension_enviada BOOLEAN DEFAULT FALSE
        `);
        
        // 2. Crear historial
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.reubicaciones_estado_historial (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                pipeline_id UUID NOT NULL REFERENCES reubicaciones_pipeline(id) ON DELETE CASCADE,
                estado_anterior VARCHAR(20),
                estado_nuevo VARCHAR(20) NOT NULL,
                evento_id TEXT,
                motivo TEXT,
                cambiado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        
        // 3. Índices
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_historial_pipeline 
                ON reubicaciones_estado_historial(pipeline_id, cambiado_en DESC);
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_pipeline_estado 
                ON reubicaciones_pipeline(estado);
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_pipeline_tipo_ficha 
                ON reubicaciones_pipeline(tipo_ficha)
        `);
        
        // 4. Extender ficha_novedades_staging
        await pool.query(`
            ALTER TABLE public.ficha_novedades_staging 
            ADD COLUMN IF NOT EXISTS sincronizado_pipeline BOOLEAN DEFAULT FALSE
        `);
        
        // 5. Índice para recovery
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_ficha_novedades_sincronizado 
                ON ficha_novedades_staging(sincronizado_pipeline) 
                WHERE sincronizado_pipeline = FALSE AND status = 'aplicado'
        `);

        // ============================================
        // NUEVO: TABLAS DE HU-04
        // ============================================

        // 6. Tabla de observaciones de CH
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.reubicaciones_observaciones (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                pipeline_id UUID NOT NULL REFERENCES reubicaciones_pipeline(id) ON DELETE CASCADE,
                version INTEGER NOT NULL DEFAULT 1,
                observacion TEXT NOT NULL,
                actor_user_id UUID NOT NULL REFERENCES users(id),
                actor_role TEXT NOT NULL,
                fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(pipeline_id, version)
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_obs_pipeline 
                ON reubicaciones_observaciones(pipeline_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_obs_fecha 
                ON reubicaciones_observaciones(fecha DESC)
        `);

        // 7. Tabla de decisiones de GP
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.reubicaciones_decisiones (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                pipeline_id UUID NOT NULL REFERENCES reubicaciones_pipeline(id) ON DELETE CASCADE,
                decision TEXT NOT NULL CHECK (decision IN ('APTO', 'NO_APTO')),
                justificacion TEXT NOT NULL,
                decidido_por_user_id UUID NOT NULL REFERENCES users(id),
                decidido_por_role TEXT NOT NULL,
                fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_dec_pipeline 
                ON reubicaciones_decisiones(pipeline_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reubicaciones_dec_fecha 
                ON reubicaciones_decisiones(fecha DESC)
        `);

        logInfo(logger, 'Esquema reubicaciones listo (idempotente).');
    } catch (error) {
        if (isIgnorableDdlError(error)) {
            logWarn(logger, 'Permisos insuficientes para esquema reubicaciones.');
            return;
        }
        throw error;
    }
}

// Agregar la llamada en ensureOnboardingSchema()
async function ensureOnboardingSchema({ pool, logger } = {}) {
    // ... funciones existentes ...
    await ensureReubicacionesSchema({ pool, logger });
    // ...
}

module.exports = {
    ensureOnboardingSchema,
    ensureColaboradoresOnboardingColumns,
    ensureColaboradoresViews,
    ensureCatMotivoBajaTable,
    ensureCatCiudadesTable,
    ensureCatAfiliacionesTables,
    ensureOnboardingStagingTable,
    ensureFichaNovedadesStagingTable,
    ensureEtlExcelLogTable,
    ensureColaboradorCalculoSalarialTable,
    ensureColaboradorLicenciasMaternidadTable,
    ensureColaboradorDocumentosExtranjerosTable,
    ensureColaboradorPolizasInternacionalesTable,
    ensureColaboradorCapacitacionesTable,
    ensurePersonasExternasHeadhuntingTable,
    ensureDynamoStreamCheckpointTable,
    CAT_MOTIVO_BAJA_SEMILLA
};
