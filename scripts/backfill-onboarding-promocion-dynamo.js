/**
 * Backfill: promueve candidatos terminales de Dynamo (`Finalizado`, etc.) a
 * `colaboradores` / Próximos a ingresar.
 *
 * Uso (desde la raíz del repo, con .env apuntando a la BD deseada):
 *   node scripts/backfill-onboarding-promocion-dynamo.js
 *   node scripts/backfill-onboarding-promocion-dynamo.js --apply
 *   node scripts/backfill-onboarding-promocion-dynamo.js --apply --cedulas=1128052332,53930907,1001050555,1022360022
 *
 * Sin --apply solo lista (dry-run). No muta prod sin flags explícitos.
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { buildDynamoLowLevelClientConfig } = require('../src/contratacion/awsDynamoClientConfig');
const { scanAllItems } = require('../src/contratacion/utils/dynamoPaged');
const {
    createOnboardingPromotionService,
    mapDynamoItemForPromotion,
    isTerminalStatus,
    isRejectedStatus
} = require('../src/onboarding/onboardingPromotionService');

const APPLY = process.argv.includes('--apply');
const cedulasArg = process.argv.find((a) => a.startsWith('--cedulas='));
const CEDULA_FILTER = cedulasArg
    ? new Set(
          cedulasArg
              .slice('--cedulas='.length)
              .split(',')
              .map((s) => String(s).replace(/\D+/g, ''))
              .filter(Boolean)
      )
    : null;

function createPool() {
    const password = String(process.env.DB_PASSWORD || '').trim();
    if (!password) throw new Error('DB_PASSWORD es obligatorio.');
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password,
        max: 4,
        ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined
    });
}

function createDocClient() {
    const credentials =
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                  ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
              }
            : undefined;
    const cfg = buildDynamoLowLevelClientConfig({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials
    });
    return DynamoDBDocumentClient.from(new DynamoDBClient(cfg));
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

async function main() {
    const tableName = String(process.env.DYNAMODB_TABLE_NAME || '').trim();
    if (!tableName) throw new Error('DYNAMODB_TABLE_NAME es obligatorio.');

    console.log(
        `[backfill-onboarding] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} table=${tableName}` +
            (CEDULA_FILTER ? ` cedulas=${[...CEDULA_FILTER].join(',')}` : '')
    );

    const docClient = createDocClient();
    const items = await scanAllItems(docClient, tableName, {
        maxItems: Number(process.env.CONTRATACION_MAX_ITEMS || 5000) || 5000
    });

    const candidates = [];
    for (const raw of items) {
        if (isZohoItem(raw)) continue;
        const status = raw.status || raw.statuses;
        if (isRejectedStatus(status) || !isTerminalStatus(status)) continue;
        const payload = mapDynamoItemForPromotion(raw);
        if (!payload.cedula) continue;
        if (CEDULA_FILTER && !CEDULA_FILTER.has(payload.cedula)) continue;
        candidates.push({ raw, payload });
    }

    console.log(`[backfill-onboarding] candidatos terminales: ${candidates.length}`);
    for (const { payload } of candidates) {
        console.log(
            `  - ${payload.cedula} | ${payload.nombre} | status=${payload.status} | fecha_ingreso=${payload.fecha_ingreso || 'null'} | cliente=${payload.cliente || '-'}`
        );
    }

    if (!APPLY) {
        console.log('[backfill-onboarding] dry-run OK. Reejecuta con --apply para promover.');
        return;
    }

    const pool = createPool();
    const promotion = createOnboardingPromotionService({ pool });
    const summary = { aplicado: 0, requiere_revision: 0, recibido: 0, rechazado: 0, errors: 0 };

    try {
        for (const { payload } of candidates) {
            const seq = `backfill:${payload.cedula}:${String(payload.status || '').toLowerCase()}`;
            try {
                // eslint-disable-next-line no-await-in-loop
                const result = await promotion.promoteToColaborador(payload, 'dynamo_stream', {
                    eventType: 'MODIFY',
                    sequenceNumber: seq,
                    shardId: 'backfill_onboarding_script'
                });
                const st = result.status || 'unknown';
                if (summary[st] != null) summary[st] += 1;
                else if (result.ok) summary.aplicado += 1;
                else summary.requiere_revision += 1;
                console.log(
                    `  → ${payload.cedula}: ${st}${result.error ? ` (${result.error})` : ''}`
                );
            } catch (e) {
                summary.errors += 1;
                console.error(`  → ${payload.cedula}: ERROR ${e.message}`);
            }
        }
    } finally {
        await pool.end();
    }

    console.log('[backfill-onboarding] resumen', summary);

    const poolCheck = createPool();
    try {
        const prox = await poolCheck.query(
            `SELECT cedula, nombre, fecha_ingreso, cliente
             FROM colaboradores
             WHERE activo IS TRUE AND fecha_ingreso > CURRENT_DATE
             ORDER BY fecha_ingreso, nombre`
        );
        console.log(`[backfill-onboarding] próximos a ingresar ahora: ${prox.rows.length}`);
        for (const row of prox.rows) {
            console.log(`  - ${row.cedula} | ${row.nombre} | ${row.fecha_ingreso} | ${row.cliente || '-'}`);
        }
    } finally {
        await poolCheck.end();
    }
}

main().catch((e) => {
    console.error('[backfill-onboarding] FATAL', e);
    process.exit(1);
});
