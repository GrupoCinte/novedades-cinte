const path = require('node:path');
const { logger } = require('./logger');
const {
    initContratacionRealtime,
    shutdownContratacionRealtime
} = require('./contratacion/initContratacionRealtime');
const { ensureOnboardingSchema } = require('./onboarding/onboardingSchema');
const { ensureSourcingSchema } = require('./sourcing/sourcingSchema');

function logCognitoConfig(deps) {
    const { COGNITO_ENABLED, COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_SECRET } = deps;
    if (COGNITO_ENABLED) {
        logger.info({ cognitoRegion: COGNITO_REGION || 'sin-region', userPoolId: COGNITO_USER_POOL_ID || 'sin-pool' }, 'Cognito activo');
        if (!COGNITO_APP_CLIENT_SECRET) {
            logger.warn('COGNITO_APP_CLIENT_SECRET no configurado (solo valido para app client sin secret).');
        }
    } else {
        logger.warn('Cognito inactivo: usando JWT local.');
    }
}

function logS3Config(deps) {
    const { s3Client, S3_ENABLED, S3_BUCKET_NAME, S3_REGION, S3_AUTH_MODE } = deps;
    if (s3Client) {
        logger.info({ bucket: S3_BUCKET_NAME, region: S3_REGION, authMode: S3_AUTH_MODE }, 'S3 activo');
        if (S3_AUTH_MODE === 'role') {
            logger.info('S3 usando IAM Role (sin access keys en .env).');
        } else if (S3_AUTH_MODE === 'keys') {
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                logger.warn('S3_AUTH_MODE=keys pero faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.');
            } else {
                logger.warn('S3 usando access keys locales (modo temporal).');
            }
        }
    } else if (S3_ENABLED) {
        logger.warn(
            'S3_ENABLED=true pero falta S3_BUCKET_NAME (o está vacío): soportes en S3 no funcionarán hasta completar .env (ver .env.example).'
        );
    } else {
        logger.warn('S3 inactivo: usando almacenamiento local en /assets/uploads.');
    }
}

function logStartupConfig(deps) {
    const { PORT } = deps;
    logger.info({ port: PORT }, `Servidor listo en http://localhost:${PORT}`);
    logger.info({ dbName: process.env.DB_NAME || 'novedades_cinte', dbHost: process.env.DB_HOST || 'localhost', dbPort: process.env.DB_PORT || 5432 }, 'DB conectada');
    
    logCognitoConfig(deps);
    logS3Config(deps);
    
    logger.info({ assetsPath: path.join(process.cwd(), 'assets') }, 'Carpeta assets');
}

async function safeInit(fn, pool, name) {
    if (typeof fn !== 'function') return;
    try {
        await fn(pool);
    } catch (e) {
        logger.warn({ error: e?.message }, `Inicialización DDL ${name} omitida o sin permisos`);
    }
}

async function startServer(deps) {
    const {
        app,
        pool,
        ensureUserRoleEnumValues,
        ensureClientesLideresTable,
        ensureClientesLideresNitColumn,
        ensureClientesLideresGpUserColumn,
        ensureNovedadesIndexes,
        ensureNovedadesHourSplitColumns,
        ensureNovedadesMontoCopColumn,
        ensureNovedadesApproverEmailColumns,
        ensureNovedadesHoraExtraAlertColumns,
        ensureNovedadesHeDomingoObservacionColumn,
        ensureNovedadesNominaVerificacionColumns,
        ensureNovedadesNominaProcesadoColumns,
        ensureNovedadesHorasRecargoDomingoColumn,
        ensureNovedadesModalidadVotacionUnidadColumns,
        ensureNovedadesObservacionesColumn,
        ensureNovedadesObservacionesRechazoColumn,
        ensureNovedadesDuplicadoPendienteIndex,
        migrateExcelIfNeeded,
        migrateClientesLideresFromExcelIfNeeded,
        ensureColaboradoresTable,
        ensureColaboradoresDirectoryColumns,
        ensureReubicacionesPipelineTable,
        ensureReubicacionesHU02,
        ensureMallaTurnosCeldaTable,
        ensureMallaTurnoAsignacionTable,
        ensureMallaTurnoAprobacionTable,
        ensureMallaNocturnoConfigTable,
        ensureNovedadesMallaOrigenRefColumn,
        ensureConciliacionesFacturacionTable,
        ensureConciliacionesFacturacionHistorialTable,
        ensureConciliacionesServicioNotificacionesTable,
        ensureConciliacionesServicioCierreTable,
        ensureConciliacionesEmailPlantillasTable,
        ensureConciliacionesEmailAccionesTable,
        ensureConciliacionesNovedadConsumoTable,
        ensureColaboradorAsignacionesTable,
        ensureColaboradorTarifaHistorialTable,
        ensureUsersCognitoSubColumn,
        ensureCinteLeonardoPair,
        ensureActividadesConsultorTable,
        ensureSeguimientoTables,
        PORT
    } = deps;

    await pool.query('SELECT NOW()');
    await ensureUserRoleEnumValues();
    await ensureClientesLideresTable();
    await ensureClientesLideresNitColumn();
    await ensureClientesLideresGpUserColumn();
    await ensureNovedadesIndexes();
    await ensureNovedadesHourSplitColumns();
    await ensureNovedadesMontoCopColumn();
    await ensureNovedadesApproverEmailColumns();
    await ensureNovedadesHoraExtraAlertColumns();
    await ensureNovedadesHeDomingoObservacionColumn();
    await ensureNovedadesNominaVerificacionColumns();
    await ensureNovedadesNominaProcesadoColumns();
    await ensureNovedadesHorasRecargoDomingoColumn();
    await ensureNovedadesModalidadVotacionUnidadColumns();
    await ensureNovedadesObservacionesColumn();
    await ensureNovedadesObservacionesRechazoColumn();
    await ensureNovedadesDuplicadoPendienteIndex();
    await migrateExcelIfNeeded();
    await migrateClientesLideresFromExcelIfNeeded();
    await ensureColaboradoresTable();
    await ensureColaboradoresDirectoryColumns();
    await ensureReubicacionesPipelineTable();
    await ensureReubicacionesHU02();
    await ensureMallaTurnosCeldaTable();
    await ensureMallaTurnoAsignacionTable();
    await ensureMallaTurnoAprobacionTable();
    await ensureMallaNocturnoConfigTable();
    await ensureNovedadesMallaOrigenRefColumn();
    await ensureConciliacionesFacturacionTable();
    await ensureConciliacionesFacturacionHistorialTable();
    await ensureConciliacionesServicioNotificacionesTable();
    await ensureConciliacionesServicioCierreTable();
    await ensureConciliacionesEmailPlantillasTable();
    await ensureConciliacionesEmailAccionesTable();
    await ensureConciliacionesNovedadConsumoTable();
    await ensureColaboradorAsignacionesTable();
    await ensureColaboradorTarifaHistorialTable();

    await safeInit(ensureActividadesConsultorTable, pool, 'actividades_consultor');
    await safeInit(ensureSeguimientoTables, pool, 'seguimiento');

    await safeInit(async () => {
        const { migrateColaboradoresToAsignaciones } = require('./conciliaciones/colaboradorAsignaciones');
        await migrateColaboradoresToAsignaciones(pool);
    }, null, 'colaborador_asignaciones');

    await ensureUsersCognitoSubColumn();
    await ensureCinteLeonardoPair();
    /**
     * Onboarding: extensión de `colaboradores` (tipo_personal, baja, SENA, ALIANZA, puente Dynamo)
     * + tablas satélite (calculadora, licencias, extranjeros, pólizas, capacitaciones, headhunting)
     * + catálogos (motivo_baja, ciudades, EPS/AFP/ARL/CCF) + buzón staging + log ETL.
     * Idempotente: si la BD no es owner se loguea WARN y se sigue.
     */
    await safeInit(() => ensureOnboardingSchema({ pool, logger }), null, 'onboarding_schema');
    const { ensureContratoVencimientoColumns } = require('./onboarding/contratoVencimientoService');
    await safeInit(() => ensureContratoVencimientoColumns(pool, logger), null, 'contrato_vencimiento_columns');
    await safeInit(() => ensureSourcingSchema({ pool, logger }), null, 'sourcing_schema');

    const server = app.listen(PORT, () => {
        logStartupConfig(deps);
    });

    /**
     * Proxy de Vite (dev) reutiliza TCP hacia este puerto. El `keepAliveTimeout` por defecto de Node (~5s)
     * puede cerrar el socket mientras el proxy aún lo usa → `ECONNRESET` en Vite y fallos intermitentes
     * al cargar `/api/*`. Alinear con tiempos típicos de reverse proxy.
     */
    try {
        server.keepAliveTimeout = Math.max(Number(server.keepAliveTimeout) || 0, 65_000);
        server.headersTimeout = Math.max(Number(server.headersTimeout) || 0, 66_000);
    } catch {
        /* ignore */
    }

    server.on('error', (err) => {
        if (err?.code === 'EADDRINUSE') {
            logger.fatal({ port: PORT }, 'Puerto en uso: libera el proceso o cambia PORT');
        } else {
            logger.fatal({ error: err?.message || err }, 'Error al escuchar HTTP');
        }
        process.exit(1);
    });

    const gracefulShutdown = async (signal) => {
        try {
            logger.info({ signal }, 'Cerrando servidor');
        } catch {
            // ignore
        }
        shutdownContratacionRealtime();
        await new Promise((resolve) => {
            server.close(() => resolve());
            setTimeout(resolve, 5000).unref();
        });
        try {
            await pool.end();
        } catch {
            // ignore
        }
        process.exit(0);
    };
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

    try {
        initContratacionRealtime(server, { pool });
    } catch (e) {
        logger.error({ error: e.message }, 'Contratación (realtime): no se pudo inicializar');
    }
}

module.exports = { startServer };
