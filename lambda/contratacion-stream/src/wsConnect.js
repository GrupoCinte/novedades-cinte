'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { verifyContratacionWsTicket } = require('./wsTicket');

function getSecret() {
    return String(process.env.CONTRATACION_WS_SECRET || process.env.JWT_SECRET || '').trim();
}

function createDoc() {
    const region = process.env.AWS_REGION || 'us-east-1';
    return DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
}

/**
 * API Gateway WebSocket $connect — queryStringParameters.ticket
 */
async function handler(event) {
    const connectionId = event?.requestContext?.connectionId;
    const ticket = String(event?.queryStringParameters?.ticket || '').trim();
    const table = String(process.env.CONNECTIONS_TABLE || '').trim();
    const secret = getSecret();

    if (!connectionId || !table) {
        return { statusCode: 500, body: 'Misconfigured' };
    }
    if (!secret || !ticket) {
        return { statusCode: 401, body: 'Unauthorized' };
    }

    let payload;
    try {
        payload = verifyContratacionWsTicket(secret, ticket);
    } catch {
        return { statusCode: 401, body: 'Unauthorized' };
    }

    const ttlHours = Number(process.env.WS_CONNECTION_TTL_HOURS || 24);
    const ttl = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(ttlHours * 3600));

    const doc = createDoc();
    await doc.send(
        new PutCommand({
            TableName: table,
            Item: {
                connectionId,
                sub: payload.sub,
                connectedAt: new Date().toISOString(),
                ttl
            }
        })
    );

    return { statusCode: 200, body: 'Connected' };
}

module.exports = { handler };
