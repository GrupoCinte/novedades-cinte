'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function handler(event) {
    const connectionId = event?.requestContext?.connectionId;
    const table = String(process.env.CONNECTIONS_TABLE || '').trim();
    if (!connectionId || !table) {
        return { statusCode: 200, body: 'ok' };
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    try {
        await doc.send(
            new DeleteCommand({
                TableName: table,
                Key: { connectionId }
            })
        );
    } catch (err) {
        console.warn('wsDisconnect cleanup', err?.message);
    }
    return { statusCode: 200, body: 'Disconnected' };
}

module.exports = { handler };
