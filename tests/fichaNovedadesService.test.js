const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isZohoNovedadItem,
    buildDiff,
    getAllowedFieldsForTipo,
    buildPatchFromNormalized,
    createFichaNovedadesService,
    matchColaborador
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
