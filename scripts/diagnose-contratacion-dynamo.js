#!/usr/bin/env node
/**
 * Prueba conexión DynamoDB con la misma config que el backend (env + awsDynamoClientConfig).
 * Uso: node scripts/diagnose-contratacion-dynamo.js
 */
'use strict';

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { buildDynamoLowLevelClientConfig } = require('../src/contratacion/awsDynamoClientConfig');
const { scanAllItems } = require('../src/contratacion/utils/dynamoPaged');
const { mapDynamoItemToExecution } = require('../src/contratacion/utils/mappers');

async function main() {
    const table = String(process.env.DYNAMODB_TABLE_NAME || '').trim();
    if (!table) {
        console.error('DYNAMODB_TABLE_NAME no definida.');
        process.exit(2);
    }
    const low = new DynamoDBClient(buildDynamoLowLevelClientConfig());
    const doc = DynamoDBDocumentClient.from(low);

    console.log('Tabla:', table);
    console.log('Región:', process.env.AWS_REGION || 'us-east-1');
    console.log('Endpoint custom:', process.env.DYNAMODB_ENDPOINT || process.env.AWS_ENDPOINT_URL_DYNAMODB || '(ninguno)');

    try {
        const t0 = Date.now();
        const items = await scanAllItems(doc, table, { maxItems: 25 });
        console.log('Scan OK, ítems (hasta 25):', items.length, `(${(Date.now() - t0)} ms)`);
        if (items.length) {
            const keys = Object.keys(items[0] || {});
            console.log('Claves del primer ítem:', keys.slice(0, 30).join(', '), keys.length > 30 ? '…' : '');
            let mappedOk = 0;
            for (let i = 0; i < Math.min(5, items.length); i++) {
                try {
                    const ex = mapDynamoItemToExecution(items[i]);
                    mappedOk += 1;
                    console.log(`  [${i}] executionId=${ex.executionId} statusId=${ex.statusId} realStatus=${String(ex.realStatus).slice(0, 40)}`);
                } catch (e) {
                    console.error(`  [${i}] map error:`, e.message);
                }
            }
            console.log('Mapeo OK en primeros 5:', mappedOk);
        }

        const probe = await doc.send(
            new ScanCommand({
                TableName: table,
                Limit: 1,
                Select: 'COUNT'
            })
        );
        console.log('Scan COUNT (aprox. primer segmento):', probe.Count, 'ScannedCount:', probe.ScannedCount);
    } catch (e) {
        console.error('FALLO:', e.name, e.message);
        process.exit(1);
    }
}

main();
