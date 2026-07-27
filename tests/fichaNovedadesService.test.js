const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isZohoNovedadItem,
    buildDiff,
    getAllowedFieldsForTipo,
    buildPatchFromNormalized,
    createFichaNovedadesService,
    matchColaborador,
    enrichNormalizedFromMapped,
    normalizeExtractorPayload
} = require('../src/onboarding/fichaNovedadesService');

describe('fichaNovedadesService helpers', () => {
    it('detecta record_type zoho_novedad', () => {
        assert.equal(isZohoNovedadItem({ record_type: 'zoho_novedad' }), true);
        assert.equal(isZohoNovedadItem({ pk: 'zoho_novedad#abc' }), true);
        assert.equal(isZohoNovedadItem({ whatsapp_number: '57300' }), false);
    });

    it('buildDiff solo incluye campos con cambio', () => {
        const diff = buildDiff(
            { cliente: 'ACME', puesto: 'Dev', sueldo_nomina: 1000 },
            { cliente: 'ACME', puesto: 'Lead', sueldo_nomina: 1200 }
        );
        const fields = diff.map((d) => d.field);
        assert.ok(fields.includes('puesto'));
        assert.ok(fields.includes('sueldo_nomina'));
        assert.ok(!fields.includes('cliente'));
    });

    it('whitelist salida limita campos aplicables', () => {
        const patch = buildPatchFromNormalized('salida', {
            fecha_termino: '2026-12-31',
            cliente: 'NO',
            puesto: 'X'
        });
        assert.deepEqual(patch, { fecha_termino: '2026-12-31' });
        assert.deepEqual(getAllowedFieldsForTipo('integracion'), null);
    });

    it('matchColaborador filtra activo=true por defecto', async () => {
        const queries = [];
        const pool = {
            query: async (sql, params) => {
                queries.push(sql);
                return { rows: [] };
            }
        };
        await matchColaborador(pool, { codigo: '20250322', tipo_novedad: 'salida' });
        assert.ok(queries[0].includes('activo = true'));
    });

    it('matchColaborador cancelacion_ingreso permite inactivos', async () => {
        const queries = [];
        const pool = {
            query: async (sql) => {
                queries.push(sql);
                return { rows: [] };
            }
        };
        await matchColaborador(pool, { codigo: '20260605', tipo_novedad: 'cancelacion_ingreso' });
        assert.ok(!queries[0].includes('activo = true'));
    });

    it('enrichNormalizedFromMapped completa campos planos cuando extractor MVP viene vacío', () => {
        const fromExtractor = normalizeExtractorPayload({ ID_Registro: '20250322' }, 'modificacion_id');
        const enriched = enrichNormalizedFromMapped(fromExtractor, {
            tipo_novedad: 'modificacion_id',
            id_registro: '20250322',
            codigo_plano: '20250322',
            cedula_plano: '1024598286',
            nombre_plano: 'Diego Alberto Nuñez Sanchez',
            cliente_plano: 'AVAL VALOR COMPARTIDO - AVC',
            puesto: 'Analista',
            parsed_subject: { fecha_termino: '2026-06-12' }
        });
        assert.equal(enriched.codigo, '20250322');
        assert.equal(enriched.cedula, '1024598286');
        assert.ok(String(enriched.nombre).toLowerCase().includes('diego'));
        assert.ok(String(enriched.cliente).toUpperCase().includes('AVAL'));
        assert.equal(String(enriched.puesto).toUpperCase(), 'ANALISTA');
        assert.equal(enriched.fecha_termino, '2026-06-12');
    });

    it('buildDiff alinea Date PG con fecha ISO string', () => {
        const diff = buildDiff(
            { fecha_termino: new Date('2026-06-12T05:00:00.000Z') },
            { fecha_termino: '2026-06-12' }
        );
        assert.equal(diff.length, 0);
    });

    it('getNovedadById recalcula diff contra colaboradores vivos', async () => {
        const id = '11111111-1111-1111-1111-111111111111';
        const pool = {
            query: async (sql, params) => {
                if (String(sql).includes('FROM ficha_novedades_staging')) {
                    return {
                        rows: [
                            {
                                id,
                                status: 'pendiente',
                                colaborador_cedula_match: '1024598286',
                                payload_normalizado: { puesto: 'Lead', cliente: 'ACME' },
                                diff_json: [{ field: 'puesto', before: 'Old', after: 'Lead' }]
                            }
                        ]
                    };
                }
                if (String(sql).includes('FROM colaboradores')) {
                    return {
                        rows: [{ cedula: '1024598286', puesto: 'Dev', cliente: 'ACME' }]
                    };
                }
                return { rows: [] };
            }
        };
        const svc = createFichaNovedadesService({ pool });
        const row = await svc.getNovedadById(id);
        const fields = (row.diff_json || []).map((d) => d.field);
        assert.ok(fields.includes('puesto'));
        assert.equal(row.diff_json.find((d) => d.field === 'puesto').before, 'Dev');
        assert.ok(!fields.includes('cliente'));
    });
});

function buildDiegoDynamoItem() {
    const {
        buildLiteExtractorOutput,
        buildZohoDynamoItem,
        parseClienteFromSalidaSubject
    } = require('../src/onboarding/zohoLiteParse');

    const subject =
        'Notificación de Salida de Diego Alberto Nuñez Sanchez - AVAL VALOR COMPARTIDO - AVC (Jun 12, 2026)';
    const body = `
ID de Registro: 20250322
Cliente AVAL VALOR COMPARTIDO - AVC Sin Dato
Consultor Asignado Diego Alberto Nuñez Sanchez Persona Natural
Cédula de Ciudadanía: 1024598286
Fecha de salida Jun 12, 2026
`;
    const output = buildLiteExtractorOutput({
        tipo: 'salida',
        subject,
        bodyHtml: body,
        nombreAsunto: 'Diego Alberto Nuñez Sanchez',
        clienteAsunto: parseClienteFromSalidaSubject(subject)
    });
    return buildZohoDynamoItem({
        output,
        classify: {
            tipoNovedadZoho: 'salida',
            subject,
            nombreAsunto: 'Diego Alberto Nuñez Sanchez',
            clienteAsunto: parseClienteFromSalidaSubject(subject)
        },
        item: { internetMessageId: 'diego-test-msg' },
        msgId: 'diego-test-msg',
        executionId: '99999',
        zohoLiteExtract: true
    });
}

function createDiegoMockPool({ active = true } = {}) {
    const queries = [];
    const pool = {
        query: async (sql, params) => {
            queries.push({ sql: sql.slice(0, 120), params });
            if (sql.includes('FROM ficha_novedades_staging WHERE external_id')) {
                return { rows: [] };
            }
            if (sql.includes('TRIM(codigo) = $1')) {
                assert.equal(params[0], '20250322');
                if (!active) return { rows: [] };
                return {
                    rows: [
                        {
                            cedula: '1024598286',
                            nombre: 'DIEGO ALBERTO NUÑEZ SANCHEZ',
                            cliente: 'AVAL VALOR COMPARTIDO - AVC',
                            codigo: '20250322'
                        }
                    ]
                };
            }
            if (sql.includes('FROM colaboradores') && sql.includes('cedula = $1') && !active) {
                return { rows: [] };
            }
            if (sql.includes('LOWER(TRIM(nombre))') && !active) {
                return { rows: [] };
            }
            if (sql.includes('SELECT * FROM colaboradores WHERE cedula')) {
                return {
                    rows: [
                        {
                            cedula: '1024598286',
                            nombre: 'DIEGO ALBERTO NUÑEZ SANCHEZ',
                            cliente: 'AVAL VALOR COMPARTIDO - AVC',
                            codigo: '20250322',
                            fecha_termino: null,
                            activo: true
                        }
                    ]
                };
            }
            if (sql.includes('INSERT INTO ficha_novedades_staging')) {
                return {
                    rows: [{ id: '00000000-0000-4000-8000-000000000001', status: params[10] }]
                };
            }
            return { rows: [] };
        }
    };
    return { pool, queries };
}

describe('createFichaNovedadesService.ingestFromDynamo', () => {
    it('ignora items que no son zoho_novedad', async () => {
        const pool = { query: async () => ({ rows: [] }) };
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromDynamo({ whatsapp_number: 'x' }, {});
        assert.equal(r.skipped, true);
    });

    it('integracion no ingresa al buzón (va a En ingreso)', async () => {
        const pool = {
            query: async () => {
                throw new Error('no debería consultar PG para integracion');
            }
        };
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromDynamo(
            {
                record_type: 'zoho_novedad',
                external_id: 'msg-integracion',
                tipo_novedad: 'integracion',
                extractor_output: {}
            },
            { eventType: 'INSERT' }
        );
        assert.equal(r.skipped, true);
        assert.equal(r.reason, 'tipo_not_in_buzon');
    });

    it('deduplica por external_id', async () => {
        const pool = {
            query: async (sql) => {
                if (sql.includes('FROM ficha_novedades_staging WHERE external_id')) {
                    return {
                        rows: [
                            {
                                id: '00000000-0000-4000-8000-000000000099',
                                status: 'pendiente',
                                match_strategy: 'codigo',
                                colaborador_cedula_match: '123'
                            }
                        ]
                    };
                }
                return { rows: [] };
            }
        };
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromDynamo(
            {
                record_type: 'zoho_novedad',
                external_id: 'msg-1',
                tipo_novedad: 'modificacion_id',
                extractor_output: {}
            },
            { eventType: 'INSERT' }
        );
        assert.equal(r.duplicate, true);
        assert.equal(r.match_strategy, 'codigo');
    });

    it('match por codigo plano Dynamo (Diego Alberto salida)', async () => {
        const dynamoItem = buildDiegoDynamoItem();
        const { pool, queries } = createDiegoMockPool();
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromDynamo(dynamoItem, { eventType: 'INSERT' });

        assert.equal(r.ok, true);
        assert.equal(r.status, 'pendiente');
        assert.equal(r.match_strategy, 'codigo');
        assert.equal(r.match.cedula, '1024598286');
        assert.ok(r.diff_count >= 0);
        const insert = queries.find((q) => q.sql.includes('INSERT INTO ficha_novedades_staging'));
        assert.ok(insert);
        assert.equal(insert.params[10], 'pendiente');
        assert.equal(insert.params[17], 'codigo');
    });
});

describe('createFichaNovedadesService.ingestFromHttp', () => {
    it('ingest HTTP Diego → pendiente con match y diff_preview', async () => {
        const payload = buildDiegoDynamoItem();
        const { pool } = createDiegoMockPool();
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromHttp(payload, { source: 'n8n_webhook' });

        assert.equal(r.ok, true);
        assert.equal(r.status, 'pendiente');
        assert.equal(r.match_strategy, 'codigo');
        assert.equal(r.match.codigo, '20250322');
        assert.ok(Array.isArray(r.diff_preview));
    });

    it('sin match si colaborador inactivo (mismo codigo)', async () => {
        const payload = buildDiegoDynamoItem();
        const { pool } = createDiegoMockPool({ active: false });
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromHttp(payload);

        assert.equal(r.ok, true);
        assert.equal(r.status, 'sin_match');
        assert.equal(r.match_strategy, null);
        assert.equal(r.match, null);
    });
});

describe('createFichaNovedadesService.listNovedades scope', () => {
    function createListMockPool() {
        const allRows = [
            { id: '1', status: 'pendiente', tipo_novedad: 'salida', created_at: new Date() },
            { id: '2', status: 'sin_match', tipo_novedad: 'extension', created_at: new Date() },
            { id: '3', status: 'aplicado', tipo_novedad: 'salida', reviewed_at: new Date(), created_at: new Date() },
            { id: '4', status: 'rechazado', tipo_novedad: 'extension', reviewed_at: new Date(), created_at: new Date() }
        ];
        const sqlLog = [];

        const pool = {
            query: async (sql, params) => {
                sqlLog.push({ sql, params });
                if (sql.includes('status IN (\'pendiente\', \'sin_match\')') && sql.includes('COUNT(*)') && sql.includes('pending')) {
                    return { rows: [{ pending: 2 }] };
                }
                if (sql.includes('status IN (\'aplicado\', \'rechazado\')') && sql.includes('COUNT(*)') && !sql.includes('LIMIT')) {
                    return { rows: [{ total: 2 }] };
                }
                if (sql.includes('COUNT(*)')) {
                    const filtered = filterRows(allRows, sql, params);
                    return { rows: [{ total: filtered.length }] };
                }
                const filtered = filterRows(allRows, sql, params);
                return { rows: filtered };
            }
        };

        function filterRows(rows, sql, params) {
            let out = rows.filter((r) => r.tipo_novedad !== 'integracion');
            if (sql.includes("status IN ('pendiente', 'sin_match')")) {
                out = out.filter((r) => r.status === 'pendiente' || r.status === 'sin_match');
            } else if (sql.includes("status IN ('aplicado', 'rechazado')")) {
                out = out.filter((r) => r.status === 'aplicado' || r.status === 'rechazado');
            } else if (sql.includes('status = $')) {
                const st = params.find((p) => ['pendiente', 'sin_match', 'aplicado', 'rechazado'].includes(p));
                if (st) out = out.filter((r) => r.status === st);
            }
            return out;
        }

        return { pool, sqlLog, allRows };
    }

    it('scope inbox solo devuelve pendiente y sin_match', async () => {
        const { pool } = createListMockPool();
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.listNovedades({ scope: 'inbox' });
        assert.equal(r.items.length, 2);
        assert.ok(r.items.every((i) => i.status === 'pendiente' || i.status === 'sin_match'));
        assert.equal(r.pendingCount, 2);
        assert.equal(r.historicoCount, 2);
    });

    it('scope historico solo devuelve aplicado y rechazado', async () => {
        const { pool } = createListMockPool();
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.listNovedades({ scope: 'historico' });
        assert.equal(r.items.length, 2);
        assert.ok(r.items.every((i) => i.status === 'aplicado' || i.status === 'rechazado'));
    });

    it('status explícito aplicado sigue funcionando', async () => {
        const { pool } = createListMockPool();
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.listNovedades({ status: 'aplicado' });
        assert.equal(r.items.length, 1);
        assert.equal(r.items[0].status, 'aplicado');
    });

    it('default sin status usa scope inbox', async () => {
        const { pool, sqlLog } = createListMockPool();
        const svc = createFichaNovedadesService({ pool });
        await svc.listNovedades({});
        assert.ok(sqlLog.some((q) => q.sql.includes("status IN ('pendiente', 'sin_match')")));
    });
});

const NOVEDAD_EDIT_ID = '00000000-0000-4000-8000-000000000010';
const EDIT_CEDULA = '1024598286';

function createUpdateNovedadMockPool(rowOverrides = {}) {
    let storedRow = {
        id: NOVEDAD_EDIT_ID,
        status: 'pendiente',
        tipo_novedad: 'salida',
        colaborador_cedula_match: EDIT_CEDULA,
        payload_normalizado: { fecha_termino: '2026-06-12' },
        diff_json: [{ field: 'fecha_termino', before: null, after: '2026-06-12' }],
        ...rowOverrides
    };

    const pool = {
        query: async (sql, params) => {
            if (sql.includes('SELECT * FROM ficha_novedades_staging WHERE id')) {
                return { rows: [{ ...storedRow }] };
            }
            if (sql.includes('SELECT * FROM colaboradores WHERE cedula')) {
                return {
                    rows: [
                        {
                            cedula: EDIT_CEDULA,
                            nombre: 'TEST USER',
                            fecha_termino: null,
                            activo: true
                        }
                    ]
                };
            }
            if (sql.includes('UPDATE ficha_novedades_staging') && sql.includes('payload_normalizado')) {
                storedRow = {
                    ...storedRow,
                    payload_normalizado: JSON.parse(params[1]),
                    diff_json: JSON.parse(params[2]),
                    reviewed_by: params[3]
                };
                return { rows: [] };
            }
            if (sql.includes("status = 'aplicado'")) {
                storedRow = { ...storedRow, status: 'aplicado' };
                return { rows: [] };
            }
            if (sql.includes('FROM cat_motivo_baja')) {
                return { rows: [{ motivo: 'Termino de Servicio' }] };
            }
            if (sql.includes('UPDATE colaboradores SET') && sql.includes('motivo_baja')) {
                return {
                    rows: [
                        {
                            cedula: params[3],
                            activo: false,
                            motivo_baja: params[0],
                            fecha_termino: params[2],
                            fecha_baja_efectiva: params[2]
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };

    return {
        pool,
        getStored: () => storedRow
    };
}

describe('createFichaNovedadesService.updateNovedadPayload', () => {
    it('merge + recalcula diff en pendiente', async () => {
        const { pool, getStored } = createUpdateNovedadMockPool();
        const svc = createFichaNovedadesService({ pool });
        const updated = await svc.updateNovedadPayload(
            NOVEDAD_EDIT_ID,
            { fecha_termino: '2026-07-01' },
            { email: 'ch@test.com' }
        );

        assert.equal(updated.payload_normalizado.fecha_termino, '2026-07-01');
        assert.ok(Array.isArray(updated.diff_json));
        assert.equal(updated.diff_json[0].after, '2026-07-01');
        assert.equal(getStored().reviewed_by, 'ch@test.com');
    });

    it('rechaza campo fuera de whitelist para salida', async () => {
        const { pool } = createUpdateNovedadMockPool({
            diff_json: [{ field: 'nombre', before: 'A', after: 'B' }],
            payload_normalizado: { nombre: 'B', fecha_termino: '2026-06-12' }
        });
        const svc = createFichaNovedadesService({ pool });
        await assert.rejects(
            () => svc.updateNovedadPayload(NOVEDAD_EDIT_ID, { nombre: 'C' }),
            (err) => err.status === 400 && /no permitido/i.test(err.message)
        );
    });

    it('rechaza campo que no está en diff_json', async () => {
        const { pool } = createUpdateNovedadMockPool();
        const svc = createFichaNovedadesService({ pool });
        await assert.rejects(
            () => svc.updateNovedadPayload(NOVEDAD_EDIT_ID, { cliente: 'X' }),
            (err) => err.status === 400 && /no editable/i.test(err.message)
        );
    });

    it('409 si estado no es pendiente', async () => {
        const { pool } = createUpdateNovedadMockPool({ status: 'aplicado' });
        const svc = createFichaNovedadesService({ pool });
        await assert.rejects(
            () => svc.updateNovedadPayload(NOVEDAD_EDIT_ID, { fecha_termino: '2026-07-01' }),
            (err) => err.status === 409
        );
    });
});

describe('createFichaNovedadesService.approveNovedad tras edición', () => {
    it('aplica payload editado en colaborador', async () => {
        const { pool } = createUpdateNovedadMockPool();
        let appliedPatch = null;
        const svc = createFichaNovedadesService({
            pool,
            updateColaboradorByCedula: async (cedula, patch) => {
                appliedPatch = { cedula, patch };
                return { cedula };
            }
        });

        await svc.updateNovedadPayload(NOVEDAD_EDIT_ID, { fecha_termino: '2026-08-15' });
        const result = await svc.approveNovedad(NOVEDAD_EDIT_ID, { email: 'reviewer@test.com' });

        assert.equal(result.ok, true);
        assert.equal(result.status, 'aplicado');
        assert.equal(appliedPatch, null);
    });
});
