const path = require('path');
const { logger } = require('./logger');
const {
    initContratacionRealtime,
    shutdownContratacionRealtime
} = require('./contratacion/initContratacionRealtime');
const { ensureOnboardingSchema } = require('./onboarding/onboardingSchema');

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
        ensureMallaTurnosCeldaTable,
        ensureMallaTurnoAsignacionTable,
        ensureMallaTurnoAprobacionTable,
        ensureMallaNocturnoConfigTable,
        ensureNovedadesMallaOrigenRefColumn,
        ensureConciliacionesFacturacionTable,
        ensureClientesFacturacionConfigTable,
        ensureUsersCognitoSubColumn,
        ensureCinteLeonardoPair,
        PORT,
        COGNITO_ENABLED,
        COGNITO_REGION,
        COGNITO_USER_POOL_ID,
        COGNITO_APP_CLIENT_SECRET,
        s3Client,
        S3_ENABLED,
        S3_BUCKET_NAME,
        S3_REGION,
        S3_AUTH_MODE
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
    await ensureMallaTurnosCeldaTable();
    await ensureMallaTurnoAsignacionTable();
    await ensureMallaTurnoAprobacionTable();
    await ensureMallaNocturnoConfigTable();
    await ensureNovedadesMallaOrigenRefColumn();
    await ensureConciliacionesFacturacionTable();
    await ensureClientesFacturacionConfigTable();
    await ensureUsersCognitoSubColumn();
    await ensureCinteLeonardoPair();
    /**
     * Onboarding: extensión de `colaboradores` (tipo_personal, baja, SENA, ALIANZA, puente Dynamo)
     * + tablas satélite (calculadora, licencias, extranjeros, pólizas, capacitaciones, headhunting)
     * + catálogos (motivo_baja, ciudades, EPS/AFP/ARL/CCF) + buzón staging + log ETL.
     * Idempotente: si la BD no es owner se loguea WARN y se sigue.
     */
    try {
        await ensureOnboardingSchema({ pool, logger });
    } catch (e) {
        logger.error({ error: e && e.message ? e.message : e }, 'Onboarding schema: error de DDL (continúa arranque)');
    }

    const server = app.listen(PORT, () => {
        logger.info({ port: PORT }, `Servidor listo en http://localhost:${PORT}`);
        logger.info({ dbName: process.env.DB_NAME || 'novedades_cinte', dbHost: process.env.DB_HOST || 'localhost', dbPort: process.env.DB_PORT || 5432 }, 'DB conectada');
        if (COGNITO_ENABLED) {
            logger.info({ cognitoRegion: COGNITO_REGION || 'sin-region', userPoolId: COGNITO_USER_POOL_ID || 'sin-pool' }, 'Cognito activo');
            if (!COGNITO_APP_CLIENT_SECRET) {
                logger.warn('COGNITO_APP_CLIENT_SECRET no configurado (solo valido para app client sin secret).');
            }
        } else {
            logger.warn('Cognito inactivo: usando JWT local.');
        }
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
        logger.info({ assetsPath: path.join(process.cwd(), 'assets') }, 'Carpeta assets');
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
        if (err && err.code === 'EADDRINUSE') {
            logger.fatal({ port: PORT }, 'Puerto en uso: libera el proceso o cambia PORT');
        } else {
            logger.fatal({ error: err && err.message ? err.message : err }, 'Error al escuchar HTTP');
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
