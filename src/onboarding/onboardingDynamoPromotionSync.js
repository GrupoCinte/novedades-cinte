'use strict';

/**
 * Reconciliación Dynamo → Postgres para candidatos terminales (Finalizado, etc.).
 * Red de seguridad cuando el StreamPoller está off y la Lambda aún no promociona,
 * o si falló un intake puntual.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { buildDynamoLowLevelClientConfig } = require('../contratacion/awsDynamoClientConfig');
const { scanAllItems } = require('../contratacion/utils/dynamoPaged');
const {
    createOnboardingPromotionService,
    mapDynamoItemForPromotion,
    isTerminalStatus,
    isRejectedStatus
} = require('./onboardingPromotionService');

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

function createDocClient(options = {}) {
    const region = options.region || process.env.AWS_REGION || 'us-east-1';
    const credentials = options.credentials != null ? options.credentials : readAwsCredentialsFromEnv();
    const clientConfig = buildDynamoLowLevelClientConfig({
        region,
        credentials: credentials != null ? credentials : undefined
    });
    return DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
}

function isZohoItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return false;
    const rt = String(rawItem.record_type || rawItem.recordType || '')
        .trim()
        .toLowerCase();
    if (rt === 'zoho_novedad') return true;
    const pk = String(rawItem.pk || rawItem.PK || rawItem.whatsapp_number || '')
        .trim()
        .toLowerCase();
    return pk.startsWith('zoho_novedad#');
}

/**
 * @param {{ pool: import('pg').Pool, logger?: any, docClient?: any, tableName?: string, maxItems?: number }} deps
 */
function createOnboardingDynamoPromotionSync(deps = {}) {
    const { pool, logger } = deps;
    if (!pool) throw new Error('createOnboardingDynamoPromotionSync requiere pool');

    const promotion = createOnboardingPromotionService({ pool, logger });
    const tableName = String(deps.tableName || process.env.DYNAMODB_TABLE_NAME || '').trim();
    const maxItems = Number(deps.maxItems || process.env.CONTRATACION_MAX_ITEMS || 5000) || 5000;
    let inFlight = false;

    async function syncTerminalFromDynamo(reason = 'manual') {
        if (inFlight) {
            return { ok: false, skipped: true, reason: 'in_flight' };
        }
        if (!tableName) {
            return { ok: false, error: 'DYNAMODB_TABLE_NAME vacía' };
        }

        inFlight = true;
        const summary = {
            reason,
            scanned: 0,
            candidates: 0,
            aplicado: 0,
            recibido: 0,
            requiere_revision: 0,
            rechazado: 0,
            errors: 0
        };

        try {
            const docClient = deps.docClient || createDocClient();
            const items = await scanAllItems(docClient, tableName, { maxItems });
            summary.scanned = items.length;

            for (const raw of items) {
                if (isZohoItem(raw)) continue;
                const status = raw.status || raw.statuses;
                if (isRejectedStatus(status)) continue;
                if (!isTerminalStatus(status)) continue;

                summary.candidates += 1;
                const payload = mapDynamoItemForPromotion(raw);
                const cedula = payload.cedula || 'sin-cedula';
                const seq = `reconcile:${cedula}:${String(status).toLowerCase()}`;

                try {
                    // eslint-disable-next-line no-await-in-loop
                    const result = await promotion.promoteToColaborador(payload, 'dynamo_stream', {
                        eventType: 'MODIFY',
                        sequenceNumber: seq,
                        shardId: 'onboarding_dynamo_promotion_sync'
                    });
                    const st = result && result.status ? result.status : 'unknown';
                    if (summary[st] != null) summary[st] += 1;
                    else if (result && result.ok) summary.aplicado += 1;
                    else summary.requiere_revision += 1;
                } catch (e) {
                    summary.errors += 1;
                    if (logger && typeof logger.error === 'function') {
                        logger.error({ error: e.message, cedula }, 'Onboarding reconcile promote error');
                    }
                }
            }

            if (logger && typeof logger.info === 'function') {
                logger.info(summary, 'Onboarding reconcile Dynamo→Postgres completado');
            }
            return { ok: true, ...summary };
        } catch (e) {
            if (logger && typeof logger.error === 'function') {
                logger.error({ reason, error: e.message }, 'Onboarding reconcile Dynamo error');
            }
            return { ok: false, error: e.message, ...summary };
        } finally {
            inFlight = false;
        }
    }

    return { syncTerminalFromDynamo };
}

module.exports = {
    createOnboardingDynamoPromotionSync,
    isZohoItem
};
