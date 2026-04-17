const path = require('path');
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
    await migrateExcelIfNeeded();
    await migrateClientesLideresFromExcelIfNeeded();
    await ensureColaboradoresTable();
    await ensureColaboradoresDirectoryColumns();
    await ensureUsersCognitoSubColumn();
    await ensureCinteLeonardoPair();

    const server = app.listen(PORT, () => {
        console.log(`Servidor listo en http://localhost:${PORT}`);
        console.log(`DB conectada a ${process.env.DB_NAME || 'novedades_cinte'} (${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432})`);
        if (COGNITO_ENABLED) {
            console.log(`Cognito activo: ${COGNITO_REGION || 'sin-region'} / ${COGNITO_USER_POOL_ID || 'sin-pool'}`);
            if (!COGNITO_APP_CLIENT_SECRET) {
                console.log('Aviso: COGNITO_APP_CLIENT_SECRET no configurado (solo valido para app client sin secret).');
            }
        } else {
            console.log('Cognito inactivo: usando JWT local.');
        }
        if (s3Client) {
            console.log(`S3 activo: bucket=${S3_BUCKET_NAME}, region=${S3_REGION}, auth=${S3_AUTH_MODE}`);
            if (S3_AUTH_MODE === 'role') {
                console.log('S3 usando IAM Role (sin access keys en .env).');
            } else if (S3_AUTH_MODE === 'keys') {
                if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                    console.log('Aviso: S3_AUTH_MODE=keys pero faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.');
                } else {
                    console.log('S3 usando access keys locales (modo temporal).');
                }
            }
        } else {
            console.log('S3 inactivo: usando almacenamiento local en /assets/uploads.');
        }
        console.log(`Carpeta assets: ${path.join(process.cwd(), 'assets')}`);
    });

    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.error(`\n[FATAL] El puerto ${PORT} ya está en uso (otra ventana de npm run dev, o proceso colgado).`);
            console.error('Cierra esa instancia o libera el puerto.');
            console.error('Windows (PowerShell): Get-NetTCPConnection -LocalPort ' + PORT + ' | Select OwningProcess');
            console.error('O clásico: netstat -ano | findstr ":' + PORT + '"  →  taskkill /PID <pid> /F');
            console.error('Alternativa: define otro PORT en .env y el mismo valor en react-frontend/vite.config.js (proxy target).\n');
        } else {
            console.error('[FATAL] Error al escuchar HTTP:', err && err.message ? err.message : err);
        }
        process.exit(1);
    });

    const gracefulShutdown = async (signal) => {
        try {
            console.log(`\n${signal}: cerrando servidor…`);
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
        console.error('Contratación IA (realtime): no se pudo inicializar:', e.message);
    }
}

module.exports = { startServer };
