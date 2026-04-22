const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { logger } = require('../../logger');

const DEFAULT_MAX = Math.min(Math.max(Number(process.env.DYNAMO_SCAN_QUERY_MAX_ITEMS || 5000), 1), 100000);

async function scanAllItems(docClient, TableName, opts = {}) {
    const cap = Math.min(Math.max(Number(opts.maxItems || DEFAULT_MAX), 1), 100000);
    const items = [];
    let ExclusiveStartKey;
    do {
        const resp = await docClient.send(
            new ScanCommand({
                TableName,
                ExclusiveStartKey
            })
        );
        if (resp.Items?.length) {
            items.push(...resp.Items);
        }
        if (items.length > cap) {
            logger.warn(
                { table: TableName, cap, scanned: items.length },
                '[dynamoPaged] scanAllItems alcanzó tope; devolviendo resultados truncados'
            );
            return items.slice(0, cap);
        }
        ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

async function queryAllItems(docClient, baseInput, opts = {}) {
    const cap = Math.min(Math.max(Number(opts.maxItems || DEFAULT_MAX), 1), 100000);
    const items = [];
    let ExclusiveStartKey;
    do {
        const resp = await docClient.send(
            new QueryCommand({
                ...baseInput,
                ExclusiveStartKey
            })
        );
        if (resp.Items?.length) {
            items.push(...resp.Items);
        }
        if (items.length > cap) {
            logger.warn(
                { table: baseInput.TableName, cap, scanned: items.length },
                '[dynamoPaged] queryAllItems alcanzó tope; devolviendo resultados truncados'
            );
            return items.slice(0, cap);
        }
        ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

module.exports = { scanAllItems, queryAllItems, DEFAULT_MAX };
