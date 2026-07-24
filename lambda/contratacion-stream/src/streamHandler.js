'use strict';

const { unmarshall } = require('@aws-sdk/util-dynamodb');
const {
    isZohoNovedadItem,
    isOnboardingMonitorItem,
    mapDynamoItemToExecution
} = require('./mapExecution');
const { broadcastToConnections } = require('./broadcast');
const { postZohoIntake } = require('./zohoIntake');
const { isTerminalOnboardingStatus, postOnboardingIntake } = require('./onboardingIntake');

function unmarshallImage(image) {
    if (!image || typeof image !== 'object') return null;
    // Ya plano (tests / fixtures) vs AttributeValue Dynamo
    const sample = Object.values(image)[0];
    if (
        sample &&
        typeof sample === 'object' &&
        ('S' in sample || 'N' in sample || 'BOOL' in sample || 'M' in sample || 'L' in sample || 'NULL' in sample)
    ) {
        return unmarshall(image);
    }
    return image;
}

/**
 * Procesa un único record de DynamoDB Streams.
 * @returns {Promise<{ action: string, detail?: object }>}
 */
async function processStreamRecord(record, deps = {}) {
    const eventName = String(record?.eventName || '').toUpperCase();
    const dynamodb = record?.dynamodb || {};
    const newImage = unmarshallImage(dynamodb.NewImage);
    const oldImage = unmarshallImage(dynamodb.OldImage);
    const rawItem = newImage || oldImage;

    if (!rawItem) {
        return { action: 'skip_empty' };
    }

    if (isZohoNovedadItem(rawItem)) {
        if (eventName === 'REMOVE') {
            return { action: 'zoho_remove_ignored' };
        }
        const post = deps.postZohoIntake || postZohoIntake;
        const result = await post(rawItem, { eventType: eventName }, deps.zohoOpts || {});
        return { action: 'zoho_intake', result };
    }

    if (!isOnboardingMonitorItem(rawItem)) {
        return { action: 'skip_unknown' };
    }

    const data = mapDynamoItemToExecution(rawItem);
    const type = eventName === 'REMOVE' ? 'REMOVE' : eventName || 'MODIFY';
    const broadcast = deps.broadcastToConnections || broadcastToConnections;
    const broadcastResult = await broadcast({ type, data }, deps.broadcastDeps);

    // Promoción a Postgres (Próximos a ingresar) en estados terminales.
    // No bloquea el WS si el intake falla: se registra y re-lanza para retry del stream.
    let promoteResult = null;
    if (eventName !== 'REMOVE' && isTerminalOnboardingStatus(rawItem.status || rawItem.statuses)) {
        const postPromote = deps.postOnboardingIntake || postOnboardingIntake;
        promoteResult = await postPromote(
            rawItem,
            {
                eventType: eventName || 'MODIFY',
                sequenceNumber: dynamodb.SequenceNumber || null,
                shardId: record.eventSourceARN || null
            },
            deps.onboardingOpts || {}
        );
    }

    return {
        action: promoteResult ? 'ws_broadcast_and_promote' : 'ws_broadcast',
        type,
        broadcastResult,
        promoteResult
    };
}

async function handler(event, _context) {
    const records = Array.isArray(event?.Records) ? event.Records : [];
    const results = [];
    for (const record of records) {
        try {
            // eslint-disable-next-line no-await-in-loop
            results.push(await processStreamRecord(record));
        } catch (err) {
            console.error('contratacion-stream record error', {
                error: err?.message,
                eventID: record?.eventID,
                eventName: record?.eventName
            });
            throw err;
        }
    }
    return { ok: true, processed: results.length, results };
}

module.exports = {
    handler,
    processStreamRecord,
    unmarshallImage
};
