const StreamPoller = require('./streamPoller');
const { ContratacionWSServer } = require('./websocketServer');
const { logger } = require('../logger');

let active = { wsServer: null, streamPoller: null };

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
 * @param {import('http').Server} server
 */
function initContratacionRealtime(server) {
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

    const pollerEnabled = String(process.env.CONTRATACION_STREAM_POLLER_ENABLED || '').toLowerCase() === 'true';

    if (!pollerEnabled || !tableName || !active.wsServer || active.streamPoller) {
        return active;
    }

    try {
        const credentials = readAwsCredentialsFromEnv();
        const poller = new StreamPoller(tableName, awsRegion, credentials, (data) => {
            if (active.wsServer) active.wsServer.broadcast(data);
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
}

module.exports = { initContratacionRealtime, shutdownContratacionRealtime };
