const path = require('path');
const { logger } = require('./logger');
const {
    initContratacionRealtime,
    shutdownContratacionRealtime
} = require('./contratacion/initContratacionRealtime');

async function startServer(deps) {
    const {
        app,
        pool,
        ensureUserRoleEnumValues,
        ensureClientesLideresTable,
        ensureClientesLideresGpUserColumn,
        ensureNovedadesIndexes,
        ensureNovedadesHourSplitColumns,
        ensureNovedadesMontoCopColumn,
        ensureNovedadesApproverEmailColumns,
        ensureNovedadesHoraExtraAlertColumns,
        ensureNovedadesHeDomingoObservacionColumn,
        ensureNovedadesHorasRecargoDomingoColumn,
        migrateExcelIfNeeded,
        migrateClientesLideresFromExcelIfNeeded,
        ensureColaboradoresTable,
        ensureColaboradoresDirectoryColumns,
        ensureUsersCognitoSubColumn,
        ensureCinteLeonardoPair,
        PORT,
        COGNITO_ENABLED,
        COGNITO_REGION,
        COGNITO_USER_POOL_ID,
        COGNITO_APP_CLIENT_SECRET,
        s3Client,
        S3_BUCKET_NAME,
        S3_REGION,
        S3_AUTH_MODE
    } = deps;

    await pool.query('SELECT NOW()');
    await ensureUserRoleEnumValues();
    await ensureClientesLideresTable();
    await ensureClientesLideresGpUserColumn();
    await ensureNovedadesIndexes();
    await ensureNovedadesHourSplitColumns();
    await ensureNovedadesMontoCopColumn();
    await ensureNovedadesApproverEmailColumns();
    await ensureNovedadesHoraExtraAlertColumns();
    await ensureNovedadesHeDomingoObservacionColumn();
    await ensureNovedadesHorasRecargoDomingoColumn();
    await migrateExcelIfNeeded();
    await migrateClientesLideresFromExcelIfNeeded();
    await ensureColaboradoresTable();
    await ensureColaboradoresDirectoryColumns();
    await ensureUsersCognitoSubColumn();
    await ensureCinteLeonardoPair();

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
        } else {
            logger.warn('S3 inactivo: usando almacenamiento local en /assets/uploads.');
        }
        logger.info({ assetsPath: path.join(process.cwd(), 'assets') }, 'Carpeta assets');
    });

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
        initContratacionRealtime(server);
    } catch (e) {
        logger.error({ error: e.message }, 'Contratación (realtime): no se pudo inicializar');
    }
}

module.exports = { startServer };
