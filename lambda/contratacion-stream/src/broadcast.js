'use strict';

const {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand
} = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

function createDeps(env = process.env) {
    const region = env.AWS_REGION || 'us-east-1';
    const table = (env.CONNECTIONS_TABLE || '').trim();
    const endpoint = (env.WS_API_ENDPOINT || '').trim();
    if (!table) throw new Error('CONNECTIONS_TABLE requerida');
    if (!endpoint) throw new Error('WS_API_ENDPOINT requerida');

    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    const mgmt = new ApiGatewayManagementApiClient({ region, endpoint });
    return { doc, mgmt, table };
}

async function listConnectionIds(doc, table) {
    const ids = [];
    let ExclusiveStartKey;
    do {
        const out = await doc.send(
            new ScanCommand({
                TableName: table,
                ProjectionExpression: 'connectionId',
                ExclusiveStartKey
            })
        );
        for (const item of out.Items || []) {
            if (item.connectionId) ids.push(String(item.connectionId));
        }
        ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return ids;
}

/**
 * Publica `{ type, data }` a todas las conexiones WS. Borra connectionIds stale (410).
 * @param {{ type: string, data: object }} message
 * @param {object} [deps]
 */
async function broadcastToConnections(message, deps) {
    const { doc, mgmt, table } = deps || createDeps();
    const body = Buffer.from(JSON.stringify(message));
    const ids = await listConnectionIds(doc, table);
    let sent = 0;
    let stale = 0;

    for (const connectionId of ids) {
        try {
            await mgmt.send(
                new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: body
                })
            );
            sent += 1;
        } catch (err) {
            const status = err?.$metadata?.httpStatusCode || err?.statusCode;
            if (status === 410 || err?.name === 'GoneException') {
                stale += 1;
                try {
                    await doc.send(
                        new DeleteCommand({
                            TableName: table,
                            Key: { connectionId }
                        })
                    );
                } catch {
                    // ignore cleanup errors
                }
            } else {
                throw err;
            }
        }
    }

    return { sent, stale, total: ids.length };
}

module.exports = {
    createDeps,
    listConnectionIds,
    broadcastToConnections
};
