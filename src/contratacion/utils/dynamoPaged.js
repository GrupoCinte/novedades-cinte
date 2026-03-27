const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

async function scanAllItems(docClient, TableName) {
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
        ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

async function queryAllItems(docClient, baseInput) {
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
        ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

module.exports = { scanAllItems, queryAllItems };
