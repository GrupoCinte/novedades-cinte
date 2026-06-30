const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    createFichaNovedadesService,
    getLastZohoDynamoSyncSummary
} = require('../src/onboarding/fichaNovedadesService');
const {
    isZohoNovedadScanItem,
    sortZohoItemsByReceivedAt
} = require('../src/onboarding/zohoDynamoScan');

function buildZohoItem({ externalId, tipo, receivedAt, codigo = '20260001' }) {
    return {
        record_type: 'zoho_novedad',
        pk: `zoho_novedad#${externalId}`,
        whatsapp_number: `zoho_novedad#${externalId}`,
        external_id: externalId,
        tipo_novedad: tipo,
        id_registro: codigo,
        codigo,
        subject: `Test ${tipo}`,
        received_at: receivedAt,
        extractor_output: { I_Informacion_General: { ID_Registro: codigo } }
    };
}

function createSyncMockPool({ knownExternalIds = [] } = {}) {
    const known = new Set(knownExternalIds);
    const inserts = [];

    const pool = {
        query: async (sql, params) => {
            if (sql.includes('SELECT external_id FROM ficha_novedades_staging')) {
                return { rows: [...known].map((external_id) => ({ external_id })) };
            }
            if (sql.includes('FROM ficha_novedades_staging WHERE external_id')) {
                const ext = params[0];
                if (known.has(ext)) {
                    return {
                        rows: [
                            {
                                id: '00000000-0000-4000-8000-000000009999',
                                status: 'pendiente',
                                match_strategy: null,
                                colaborador_cedula_match: null
                            }
                        ]
                    };
                }
                return { rows: [] };
            }
            if (sql.includes('TRIM(codigo) = $1')) {
                return { rows: [] };
            }
            if (sql.includes('INSERT INTO ficha_novedades_staging')) {
                inserts.push(params);
                known.add(params[1]);
                return {
                    rows: [{ id: '00000000-0000-4000-8000-000000000001', status: params[10] }]
                };
            }
            return { rows: [] };
        }
    };

    return { pool, inserts, known };
}

describe('zohoDynamoScan helpers', () => {
    it('detecta ítems zoho_novedad en scan', () => {
        assert.equal(isZohoNovedadScanItem({ pk: 'zoho_novedad#abc' }), true);
        assert.equal(isZohoNovedadScanItem({ whatsapp_number: '57300' }), false);
    });

    it('ordena por received_at ascendente', () => {
        const sorted = sortZohoItemsByReceivedAt([
            buildZohoItem({ externalId: 'b', tipo: 'extension', receivedAt: '2026-06-18T10:00:00Z' }),
            buildZohoItem({ externalId: 'a', tipo: 'salida', receivedAt: '2026-06-17T10:00:00Z' })
        ]);
        assert.equal(sorted[0].external_id, 'a');
        assert.equal(sorted[1].external_id, 'b');
    });
});

describe('createFichaNovedadesService.syncMissingFromDynamo', () => {
    it('inserta solo faltantes cuando hay 2 ítems Dynamo y 1 ya en PG', async () => {
        const itemKnown = buildZohoItem({
            externalId: 'known-msg',
            tipo: 'salida',
            receivedAt: '2026-06-17T10:00:00Z'
        });
        const itemNew = buildZohoItem({
            externalId: 'new-msg',
            tipo: 'extension',
            receivedAt: '2026-06-18T10:00:00Z'
        });

        const { pool, inserts } = createSyncMockPool({ knownExternalIds: ['known-msg'] });
        const svc = createFichaNovedadesService({ pool });

        const summary = await svc.syncMissingFromDynamo({
            tableName: 'test_table',
            itemsOverride: [itemKnown, itemNew]
        });

        assert.equal(summary.ok, true);
        assert.equal(summary.scanned, 2);
        assert.equal(summary.inserted, 1);
        assert.equal(summary.skipped_duplicate, 1);
        assert.equal(inserts.length, 1);
        assert.equal(inserts[0][1], 'new-msg');
        assert.equal(summary.by_tipo.extension, 1);
        assert.equal(summary.by_status.sin_match, 1);
    });

    it('segunda corrida no inserta duplicados', async () => {
        const itemA = buildZohoItem({
            externalId: 'msg-a',
            tipo: 'modificacion_id',
            receivedAt: '2026-06-18T11:00:00Z'
        });
        const itemB = buildZohoItem({
            externalId: 'msg-b',
            tipo: 'modificacion_id',
            receivedAt: '2026-06-18T12:00:00Z'
        });

        const { pool } = createSyncMockPool();
        const svc = createFichaNovedadesService({ pool });

        const first = await svc.syncMissingFromDynamo({
            tableName: 'test_table',
            itemsOverride: [itemA, itemB]
        });
        assert.equal(first.inserted, 2);

        const second = await svc.syncMissingFromDynamo({
            tableName: 'test_table',
            itemsOverride: [itemA, itemB]
        });
        assert.equal(second.inserted, 0);
        assert.equal(second.skipped_duplicate, 2);
    });

    it('dry-run cuenta would_insert sin insertar', async () => {
        const item = buildZohoItem({
            externalId: 'dry-msg',
            tipo: 'salida',
            receivedAt: '2026-06-18T09:00:00Z'
        });
        const { pool, inserts } = createSyncMockPool();
        const svc = createFichaNovedadesService({ pool });

        const summary = await svc.syncMissingFromDynamo({
            tableName: 'test_table',
            dryRun: true,
            itemsOverride: [item]
        });

        assert.equal(summary.dry_run, true);
        assert.equal(summary.would_insert, 1);
        assert.equal(summary.inserted, 0);
        assert.equal(inserts.length, 0);
    });

    it('sync omite integracion (excluded tipo)', async () => {
        const item = buildZohoItem({
            externalId: 'int-msg',
            tipo: 'integracion',
            receivedAt: '2026-06-18T08:00:00Z'
        });
        const { pool, inserts } = createSyncMockPool();
        const svc = createFichaNovedadesService({ pool });

        const summary = await svc.syncMissingFromDynamo({
            tableName: 'test_table',
            itemsOverride: [item]
        });

        assert.equal(summary.skipped_excluded_tipo, 1);
        assert.equal(summary.inserted, 0);
        assert.equal(inserts.length, 0);
    });

    it('expone last sync summary global', async () => {
        const { pool } = createSyncMockPool();
        const svc = createFichaNovedadesService({ pool });
        await svc.syncMissingFromDynamo({ tableName: 't', itemsOverride: [] });
        const last = getLastZohoDynamoSyncSummary();
        assert.ok(last);
        assert.equal(last.scanned, 0);
        assert.ok(last.finished_at);
    });
});
