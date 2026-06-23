'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { buildDynamoLowLevelClientConfig } = require('../contratacion/awsDynamoClientConfig');

const ZOHO_RECORD_TYPE = 'zoho_novedad';

function isZohoNovedadScanItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return false;
    const rt = String(rawItem.record_type || rawItem.recordType || '').trim().toLowerCase();
    if (rt === ZOHO_RECORD_TYPE) return true;
    const pk = String(rawItem.pk || rawItem.PK || rawItem.whatsapp_number || '').trim().toLowerCase();
    return pk.startsWith('zoho_novedad#');
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

function createZohoDynamoDocumentClient(options = {}) {
    const region = options.region || process.env.AWS_REGION || 'us-east-1';
    const credentials = options.credentials != null ? options.credentials : readAwsCredentialsFromEnv();
    const clientConfig = buildDynamoLowLevelClientConfig({
        region,
        credentials: credentials != null ? credentials : undefined
    });
    return DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
}

function readReceivedAtMs(item) {
    const raw = item.received_at || item.receivedAt || item.fecha_recepcion || null;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
}

function sortZohoItemsByReceivedAt(items) {
    return [...items].sort((a, b) => readReceivedAtMs(a) - readReceivedAtMs(b));
}

/**
 * Scan paginado de la tabla Dynamo; filtra ítems Zoho novedad en memoria.
 * @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {{ limit?: number, pageSize?: number, maxPages?: number }} [options]
 */
async function scanZohoNovedadItems(docClient, tableName, options = {}) {
    const pageSize = Math.min(Math.max(Number(options.pageSize) || 200, 1), 500);
    const hardLimit = options.limit != null ? Math.max(Number(options.limit) || 0, 0) : null;
    const maxPages = options.maxPages != null ? Math.max(Number(options.maxPages) || 0, 1) : null;

    const items = [];
    let lastKey;
    let pages = 0;

    do {
        const res = await docClient.send(
            new ScanCommand({
                TableName: tableName,
                ExclusiveStartKey: lastKey,
                Limit: pageSize
            })
        );

        for (const it of res.Items || []) {
            if (isZohoNovedadScanItem(it)) {
                items.push(it);
            }
        }

        lastKey = res.LastEvaluatedKey;
        pages += 1;

        if (hardLimit && items.length >= hardLimit) break;
        if (maxPages && pages >= maxPages) break;
    } while (lastKey);

    const sorted = sortZohoItemsByReceivedAt(items);
    return hardLimit ? sorted.slice(0, hardLimit) : sorted;
}

module.exports = {
    ZOHO_RECORD_TYPE,
    isZohoNovedadScanItem,
    createZohoDynamoDocumentClient,
    scanZohoNovedadItems,
    sortZohoItemsByReceivedAt,
    readReceivedAtMs
};
