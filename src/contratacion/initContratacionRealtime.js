const StreamPoller = require('./streamPoller');
const { ContratacionWSServer } = require('./websocketServer');
const { logger } = require('../logger');
const {
    createOnboardingPromotionService,
    mapDynamoItemForPromotion
} = require('../onboarding/onboardingPromotionService');
const {
    createFichaNovedadesService,
    isZohoNovedadItem
} = require('../onboarding/fichaNovedadesService');
const { createOnboardingDynamoPromotionSync } = require('../onboarding/onboardingDynamoPromotionSync');

let active = {
    wsServer: null,
    streamPoller: null,
    promotionService: null,
    fichaNovedadesService: null,
    promotionSync: null
};
let zohoSyncIntervalHandle = null;
let zohoSyncInFlight = false;
let promotionSyncIntervalHandle = null;
let reubicacionesSyncIntervalHandle = null;

function readEnvBool(name, defaultValue = false) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') return defaultValue;
    return String(raw).trim().toLowerCase() === 'true';
}

function readEnvInt(name, defaultValue = 0) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') return defaultValue;
    const n = Number(raw);
    return Number.isFinite(n) ? n : defaultValue;
}

async function runZohoDynamoSyncIfIdle(service, reason) {
    if (!service || typeof service.syncMissingFromDynamo !== 'function') return null;
    if (zohoSyncInFlight) {
        logger.warn({ reason }, 'FichaNovedades sync omitido: ejecución previa en curso');
        return null;
    }
    zohoSyncInFlight = true;
    try {
        const summary = await service.syncMissingFromDynamo();
        logger.info({ reason, ...summary }, 'FichaNovedades sync Dynamo completado');
        return summary;
    } catch (e) {
        logger.error({ reason, error: e.message }, 'FichaNovedades sync Dynamo error');
        return null;
    } finally {
        zohoSyncInFlight = false;
    }
}

function scheduleZohoDynamoSync(service, reason) {
    Promise.resolve(runZohoDynamoSyncIfIdle(service, reason)).catch((e) => {
        logger.error({ reason, error: e.message }, 'FichaNovedades sync Dynamo (background) error');
    });
}

function startZohoDynamoSyncScheduler(service) {
    if (readEnvBool('FICHA_NOVEDADES_DYNAMO_SYNC_ON_START', false)) {
        scheduleZohoDynamoSync(service, 'startup');
    } else if (
        readEnvBool('CONTRATACION_STREAM_POLLER_ENABLED', false) &&
        !readEnvBool('FICHA_NOVEDADES_DYNAMO_SYNC_ON_START', false)
    ) {
        logger.warn(
            'CONTRATACION_STREAM_POLLER_ENABLED=true sin FICHA_NOVEDADES_DYNAMO_SYNC_ON_START; ' +
                'Novedades Zoho pueden quedar vacías si el backend no estaba activo al recibir correos Zoho.'
        );
    }

    const intervalMs = readEnvInt('FICHA_NOVEDADES_DYNAMO_SYNC_INTERVAL_MS', 0);
    if (intervalMs > 0 && !zohoSyncIntervalHandle) {
        zohoSyncIntervalHandle = setInterval(() => {
            scheduleZohoDynamoSync(service, 'interval');
        }, intervalMs);
        if (typeof zohoSyncIntervalHandle.unref === 'function') {
            zohoSyncIntervalHandle.unref();
        }
        logger.info({ intervalMs }, 'FichaNovedades sync Dynamo periódico activo');
    }
}

function stopZohoDynamoSyncScheduler() {
    if (zohoSyncIntervalHandle) {
        clearInterval(zohoSyncIntervalHandle);
        zohoSyncIntervalHandle = null;
    }
}

function readAwsCredentialsFromEnv() {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        return {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        };
    }
    return null;
}

/**
 * Adjunta WebSocket y opcionalmente el poller de streams Dynamo, sin tumbar HTTP si falla.
 *
 * Cuando se recibe `deps.pool`, se construye además el `OnboardingPromotionService`. Si la
 * variable de entorno `ONBOARDING_AUTOPROMOTE=true`, el callback del poller persiste el evento
 * Dynamo en Postgres además de hacer broadcast por WebSocket. El broadcast a la UI **no** cambia.
 *
 * @param {import('http').Server} server
 * @param {{ pool?: import('pg').Pool }} [deps]
 */
function initContratacionRealtime(server, deps = {}) {
    const tableName = (process.env.DYNAMODB_TABLE_NAME || '').trim();
    const awsRegion = process.env.AWS_REGION || 'us-east-1';
    const wsSecret = (process.env.CONTRATACION_WS_SECRET || process.env.JWT_SECRET || '').trim();

    if (!server) return active;

    try {
        if (!active.wsServer) {
            active.wsServer = new ContratacionWSServer(server, {
                wsSecret
            });
        }
    } catch (e) {
        logger.error({ error: e.message }, 'Contratación: no se pudo inicializar WebSocket');
    }

    /**
     * Construye el servicio de promoción si tenemos pool. Se intenta siempre que haya pool;
     * la activación real está controlada por `ONBOARDING_AUTOPROMOTE`.
     */
    if (deps && deps.pool && !active.promotionService) {
        try {
            active.promotionService = createOnboardingPromotionService({ pool: deps.pool, logger });
        } catch (e) {
            logger.error({ error: e.message }, 'Onboarding: no se pudo inicializar PromotionService');
        }
    }

    if (deps && deps.pool && !active.fichaNovedadesService) {
        try {
            active.fichaNovedadesService = createFichaNovedadesService({
                pool: deps.pool,
                logger,
                updateColaboradorByCedula: deps.updateColaboradorByCedula
            });
            startZohoDynamoSyncScheduler(active.fichaNovedadesService);
        } catch (e) {
            logger.error({ error: e.message }, 'FichaNovedades: no se pudo inicializar servicio');
        }
    }

    const pollerEnabled = String(process.env.CONTRATACION_STREAM_POLLER_ENABLED || '').toLowerCase() === 'true';
    const autopromoteEnabled = String(process.env.ONBOARDING_AUTOPROMOTE || '').toLowerCase() === 'true';

    /**
     * Con poller off (Lambda WS), la promoción en vivo debe ir por Lambda → /intake.
     * Además arrancamos reconcile periódico si AUTOPROMOTE=true (red de seguridad + backfill natural).
     */
    if (autopromoteEnabled && deps && deps.pool && !active.promotionSync) {
        try {
            active.promotionSync = createOnboardingDynamoPromotionSync({
                pool: deps.pool,
                logger,
                tableName
            });
            const promoteOnStart = readEnvBool('ONBOARDING_DYNAMO_PROMOTE_ON_START', true);
            const promoteIntervalMs = readEnvInt('ONBOARDING_DYNAMO_PROMOTE_INTERVAL_MS', 300000);
            if (promoteOnStart) {
                Promise.resolve(active.promotionSync.syncTerminalFromDynamo('startup')).catch((e) => {
                    logger.error({ error: e.message }, 'Onboarding promote reconcile (startup) error');
                });
            }
            if (promoteIntervalMs > 0 && !promotionSyncIntervalHandle) {
                promotionSyncIntervalHandle = setInterval(() => {
                    Promise.resolve(active.promotionSync.syncTerminalFromDynamo('interval')).catch((e) => {
                        logger.error({ error: e.message }, 'Onboarding promote reconcile (interval) error');
                    });
                }, promoteIntervalMs);
                if (typeof promotionSyncIntervalHandle.unref === 'function') {
                    promotionSyncIntervalHandle.unref();
                }
                // HU-02: Recovery Sync para Reubicaciones y HU-05/06 Job 5 días
                if (!reubicacionesSyncIntervalHandle) {
                    const { recoverySync } = require('../reubicaciones/reubicacionesSyncService');
                    const { processVencimiento5Dias } = require('../reubicaciones/reubicacionesJob');
                    reubicacionesSyncIntervalHandle = setInterval(() => {
                        Promise.resolve(recoverySync({ pool: deps.pool, notifyService: null })).catch(e => {
                            logger.error({ error: e.message }, 'Reubicaciones recovery (interval) error');
                        });
                        Promise.resolve(processVencimiento5Dias(deps.pool, logger)).catch(e => {
                            logger.error({ error: e.message }, 'Reubicaciones vencimiento 5 días (interval) error');
                        });
                    }, promoteIntervalMs);
                    if (typeof reubicacionesSyncIntervalHandle.unref === 'function') {
                        reubicacionesSyncIntervalHandle.unref();
                    }
                }
                logger.info(
                    { promoteIntervalMs, pollerEnabled },
                    'Onboarding reconcile Dynamo→Postgres activo (AUTOPROMOTE)'
                );
            }
        } catch (e) {
            logger.error({ error: e.message }, 'Onboarding: no se pudo iniciar reconcile Dynamo→Postgres');
        }
    }

    if (!pollerEnabled || !tableName || !active.wsServer || active.streamPoller) {
        if (autopromoteEnabled && !pollerEnabled) {
            logger.info(
                'ONBOARDING_AUTOPROMOTE=true con poller off: promoción vía Lambda /intake + reconcile periódico del portal.'
            );
        }
        return active;
    }

    try {
        const credentials = readAwsCredentialsFromEnv();
        const poller = new StreamPoller(tableName, awsRegion, credentials, (event) => {
            const rawItem = event && event.rawItem;

            // Novedades Zoho: ingest a Postgres, sin broadcast al monitor de ingreso ni autopromote.
            if (rawItem && isZohoNovedadItem(rawItem) && active.fichaNovedadesService) {
                Promise.resolve(
                    active.fichaNovedadesService.ingestFromDynamo(rawItem, {
                        eventType: event.type,
                        sequenceNumber: event.sequenceNumber,
                        shardId: event.shardId
                    })
                ).catch((e) => {
                    logger.error({ error: e && e.message }, 'FichaNovedades ingest (stream) error');
                });
                return;
            }

            // 1) Broadcast a UI (comportamiento previo intacto).
            if (active.wsServer) {
                active.wsServer.broadcast({ type: event.type, data: event.data });
            }

            // 2) Promoción opcional a Postgres (solo con flag).
            if (!autopromoteEnabled) return;
            if (!active.promotionService) return;
            // Solo intentamos persistir si traemos rawItem (INSERT/MODIFY); REMOVE no promueve.
            if (!event || !event.rawItem || event.type === 'REMOVE') return;
            try {
                const payload = mapDynamoItemForPromotion(event.rawItem);
                Promise.resolve(active.promotionService.promoteToColaborador(
                    payload,
                    'dynamo_stream',
                    {
                        eventType: event.type,
                        sequenceNumber: event.sequenceNumber,
                        shardId: event.shardId
                    }
                )).catch((e) => {
                    logger.error({ error: e && e.message }, 'Onboarding autopromote (stream) error');
                });
            } catch (e) {
                logger.error({ error: e && e.message }, 'Onboarding autopromote (stream) excepción');
            }
        });
        active.streamPoller = poller;
        poller.start().catch((e) => {
            logger.error({ error: e.message }, 'Contratación StreamPoller');
        });
    } catch (e) {
        logger.error({ error: e.message }, 'Contratación: StreamPoller no iniciado');
    }

    return active;
}

function shutdownContratacionRealtime() {
    stopZohoDynamoSyncScheduler();
    if (promotionSyncIntervalHandle) {
        clearInterval(promotionSyncIntervalHandle);
        promotionSyncIntervalHandle = null;
    }
    if (reubicacionesSyncIntervalHandle) {
        clearInterval(reubicacionesSyncIntervalHandle);
        reubicacionesSyncIntervalHandle = null;
    }
    if (active.streamPoller) {
        try {
            active.streamPoller.stop();
        } catch {
            // ignore
        }
        active.streamPoller = null;
    }
    if (active.wsServer) {
        try {
            active.wsServer.close();
        } catch {
            // ignore
        }
        active.wsServer = null;
    }
    active.promotionService = null;
    active.fichaNovedadesService = null;
    active.promotionSync = null;
}

function getOnboardingPromotionService() {
    return active.promotionService || null;
}

function getFichaNovedadesService() {
    return active.fichaNovedadesService || null;
}

module.exports = {
    initContratacionRealtime,
    shutdownContratacionRealtime,
    getOnboardingPromotionService,
    getFichaNovedadesService
};
