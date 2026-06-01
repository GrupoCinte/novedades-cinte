const StreamPoller = require('./streamPoller');
const { ContratacionWSServer } = require('./websocketServer');
const { logger } = require('../logger');
const {
    createOnboardingPromotionService,
    mapDynamoItemForPromotion
} = require('../onboarding/onboardingPromotionService');

let active = { wsServer: null, streamPoller: null, promotionService: null };

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

    const pollerEnabled = String(process.env.CONTRATACION_STREAM_POLLER_ENABLED || '').toLowerCase() === 'true';
    const autopromoteEnabled = String(process.env.ONBOARDING_AUTOPROMOTE || '').toLowerCase() === 'true';

    if (!pollerEnabled || !tableName || !active.wsServer || active.streamPoller) {
        if (autopromoteEnabled && !pollerEnabled) {
            logger.warn('ONBOARDING_AUTOPROMOTE=true pero CONTRATACION_STREAM_POLLER_ENABLED=false; no habrá promoción automática Dynamo→Postgres.');
        }
        return active;
    }

    try {
        const credentials = readAwsCredentialsFromEnv();
        const poller = new StreamPoller(tableName, awsRegion, credentials, (event) => {
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
}

function getOnboardingPromotionService() {
    return active.promotionService || null;
}

module.exports = { initContratacionRealtime, shutdownContratacionRealtime, getOnboardingPromotionService };
