const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isZohoNovedadItem,
    buildDiff,
    currentForExtensionDiff,
    getAllowedFieldsForTipo,
    buildPatchFromNormalized,
    createFichaNovedadesService,
    matchColaborador,
    extractPersonHintsFromSubject,
    foldPersonName,
    isLikelyPersonCodigo,
    enrichNormalizedFromMapped,
    normalizeExtractorPayload,
    rebuildNormalizedFromStagingRow,
    groupInboxByCedula,
    SIBLING_CLOSE_REASON
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

    it('whitelist extension incluye codigo y no aplica cliente', () => {
        const allowed = getAllowedFieldsForTipo('extension');
        assert.ok(allowed.includes('codigo'));
        assert.ok(allowed.includes('fecha_notificacion_termino'));
        const patch = buildPatchFromNormalized('extension', {
            cliente: 'COLSUBSIDIO',
            fecha_termino: '2026-11-30',
            codigo: '20269902',
            puesto: 'NO'
        });
        assert.deepEqual(patch, { fecha_termino: '2026-11-30', codigo: '20269902' });
    });

    it('buildDiff salida y modificacion ocultan cliente y usan término del contrato', () => {
        const person = {
            cliente: 'FALABELLA RETAIL',
            fecha_termino: '2026-12-31',
            codigo: '20269902',
            nombre: 'PRUEBA ALAN'
        };
        const contrato = { cliente: 'Colsubsidio', fecha_termino: '2026-08-26', es_cabecera: false };
        const current = currentForExtensionDiff(person, contrato);
        const salida = buildDiff(
            current,
            {
                cliente: 'COLSUBSIDIO',
                fecha_termino: '2026-09-20',
                codigo: '20269912',
                nombre: 'ALAN RICARDO'
            },
            { tipo: 'salida' }
        );
        assert.deepEqual(
            salida.map((d) => d.field),
            ['fecha_termino']
        );
        assert.equal(salida[0].before, '2026-08-26');
        assert.equal(salida[0].after, '2026-09-20');

        const modi = buildDiff(
            current,
            {
                cliente: 'COLSUBSIDIO',
                fecha_termino: '2026-11-30',
                puesto: 'Lead'
            },
            { tipo: 'modificacion_id' }
        );
        const fields = modi.map((d) => d.field);
        assert.ok(!fields.includes('cliente'));
        assert.ok(fields.includes('puesto'));
        assert.equal(modi.find((d) => d.field === 'fecha_termino').before, '2026-08-26');
    });

    it('matchColaborador modificacion no exige vigente (puede ser cliente nuevo)', async () => {
        const person = {
            cedula: '1031647446',
            nombre: 'ALAN PRUEBA',
            cliente: 'FALABELLA RETAIL',
            codigo: '20269900'
        };
        const pool = {
            query: async (sql) => {
                if (sql.includes('FROM colaboradores') && sql.includes('cedula = $1')) {
                    return { rows: [person] };
                }
                return { rows: [] };
            }
        };
        const r = await matchColaborador(pool, {
            cedula: '1031647446',
            cliente: 'CLIENTE NUEVO',
            tipo_novedad: 'modificacion_id'
        });
        assert.equal(r.row.cedula, '1031647446');
        assert.equal(r.strategy, 'cedula');
    });

    it('buildDiff extension oculta cliente y usa término del contrato vigente', () => {
        const person = {
            cliente: 'FALABELLA RETAIL',
            fecha_termino: '2026-09-02',
            codigo: '20250322'
        };
        const contrato = { cliente: 'Colsubsidio', fecha_termino: '2026-08-26', es_cabecera: false };
        const current = currentForExtensionDiff(person, contrato);
        const diff = buildDiff(
            current,
            {
                cliente: 'COLSUBSIDIO',
                fecha_termino: '2026-11-30',
                codigo: '20250322',
                puesto: 'Analista'
            },
            { tipo: 'extension' }
        );
        const fields = diff.map((d) => d.field);
        assert.ok(!fields.includes('cliente'));
        assert.ok(!fields.includes('puesto'));
        assert.ok(!fields.includes('codigo'));
        const termino = diff.find((d) => d.field === 'fecha_termino');
        assert.ok(termino);
        assert.equal(termino.before, '2026-08-26');
        assert.equal(termino.after, '2026-11-30');
    });

    it('matchColaborador extension exige contrato vigente de ese cliente', async () => {
        const person = {
            cedula: '1031647446',
            nombre: 'ALAN PRUEBA',
            cliente: 'FALABELLA RETAIL',
            codigo: '20269900'
        };
        const poolHit = {
            query: async (sql, params) => {
                if (sql.includes('FROM colaboradores') && sql.includes('cedula = $1')) {
                    return { rows: [person] };
                }
                if (sql.includes('FROM colaborador_contratos') && sql.includes('lower(btrim(cliente))')) {
                    assert.equal(params[0], '1031647446');
                    return {
                        rows: [
                            {
                                id: 'd56c604f-0000-4000-8000-000000000002',
                                cedula: '1031647446',
                                cliente: 'Colsubsidio',
                                fecha_termino: '2026-08-26',
                                vigente: true,
                                es_cabecera: false
                            }
                        ]
                    };
                }
                return { rows: [] };
            }
        };
        const hit = await matchColaborador(poolHit, {
            cedula: '1031647446',
            cliente: 'COLSUBSIDIO',
            tipo_novedad: 'extension'
        });
        assert.equal(hit.row.cedula, '1031647446');
        assert.equal(hit.strategy, 'cedula_contrato');

        const poolMiss = {
            query: async (sql) => {
                if (sql.includes('FROM colaboradores') && sql.includes('cedula = $1')) {
                    return { rows: [person] };
                }
                return { rows: [] };
            }
        };
        const miss = await matchColaborador(poolMiss, {
            cedula: '1031647446',
            cliente: 'CLIENTE SIN VIGENTE',
            tipo_novedad: 'extension'
        });
        assert.equal(miss.row, null);
        assert.equal(miss.strategy, null);
    });

    it('matchColaborador extension sin cliente no exige consulta de contratos', async () => {
        const queries = [];
        const pool = {
            query: async (sql) => {
                queries.push(sql);
                if (sql.includes('TRIM(codigo) = $1')) {
                    return {
                        rows: [
                            {
                                cedula: '1024598286',
                                nombre: 'DIEGO',
                                cliente: 'AVAL',
                                codigo: '20250322'
                            }
                        ]
                    };
                }
                return { rows: [] };
            }
        };
        const r = await matchColaborador(pool, { codigo: '20250322', tipo_novedad: 'extension' });
        assert.equal(r.row.codigo, '20250322');
        assert.equal(r.strategy, 'codigo');
        assert.ok(!queries.some((sql) => sql.includes('colaborador_contratos')));
    });

    it('matchColaborador filtra activo=true en extension/modificacion', async () => {
        const queries = [];
        const pool = {
            query: async (sql) => {
                queries.push(sql);
                return { rows: [] };
            }
        };
        await matchColaborador(pool, { codigo: '20250322', tipo_novedad: 'extension' });
        assert.ok(queries[0].includes('activo = true'));
    });

    it('matchColaborador salida y cancelacion_ingreso permiten inactivos', async () => {
        const queries = [];
        const pool = {
            query: async (sql) => {
                queries.push(sql);
                return { rows: [] };
            }
        };
        await matchColaborador(pool, { codigo: '20260605', tipo_novedad: 'salida' });
        assert.ok(!queries[0].includes('activo = true'));
        queries.length = 0;
        await matchColaborador(pool, { codigo: '20260605', tipo_novedad: 'cancelacion_ingreso' });
        assert.ok(!queries[0].includes('activo = true'));
    });

    it('matchColaborador usa nombre del subject y fold de tildes', async () => {
        const hints = extractPersonHintsFromSubject(
            'Ticket Cerrado- RE: Modificación sobre ID 20260656 - Diego Ignacio Hoyos Montaño-DALE (Jul 22, 2026)'
        );
        assert.ok(String(hints.nombre).toLowerCase().includes('diego'));
        assert.equal(foldPersonName('MUÑOZ RODRÍGUEZ'), foldPersonName('Munoz Rodriguez'));
        assert.equal(isLikelyPersonCodigo('16366'), false);
        assert.equal(isLikelyPersonCodigo('20260656'), true);

        let sawFoldSql = false;
        const pool = {
            query: async (sql, params) => {
                if (sql.includes('translate') && params?.[0] === foldPersonName(hints.nombre)) {
                    sawFoldSql = true;
                    return {
                        rows: [{ cedula: '8161090', nombre: 'DIEGO IGNACIO HOYOS MONTAÑO', cliente: 'DALE', codigo: '20260656' }]
                    };
                }
                return { rows: [] };
            }
        };
        const r = await matchColaborador(pool, {
            codigo: '16366',
            nombre: 'nada',
            subject:
                'Ticket Cerrado- RE: Modificación sobre ID 20260656 - Diego Ignacio Hoyos Montaño-DALE (Jul 22, 2026)',
            tipo_novedad: 'modificacion_id'
        });
        assert.ok(['nombre', 'nombre_cliente'].includes(r.strategy));
        assert.equal(r.row.cedula, '8161090');
        assert.ok(sawFoldSql);
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
        assert.equal(enriched.cliente, 'AVC');
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

    it('buildDiff ignora cambio solo de mayúsculas/minúsculas en puesto', () => {
        const diff = buildDiff({ puesto: 'Analista' }, { puesto: 'ANALISTA' });
        assert.equal(diff.length, 0);
    });

    it('buildDiff trata money numérico y string como iguales', () => {
        const diff = buildDiff({ sueldo_nomina: 5000000 }, { sueldo_nomina: '5000000' });
        assert.equal(diff.length, 0);
    });

    it('enrichNormalizedFromMapped fuerza codigo de persona sobre oportunidad', () => {
        const enriched = enrichNormalizedFromMapped(
            { codigo: 'OPP-999', puesto: 'Dev' },
            {
                tipo_novedad: 'modificacion_id',
                id_registro: '20250322',
                codigo_plano: 'OPP-999'
            }
        );
        assert.equal(enriched.codigo, '20250322');
    });

    it('rebuildNormalizedFromStagingRow corrige empleador=cliente legacy', () => {
        const rebuilt = rebuildNormalizedFromStagingRow({
            status: 'pendiente',
            tipo_novedad: 'modificacion_id',
            id_registro: '20250322',
            payload_raw: {
                record_type: 'zoho_novedad',
                tipo_novedad: 'modificacion_id',
                id_registro: '20250322',
                extractor_output: {
                    ID_Registro: '20250322',
                    I_Informacion_General: {
                        Cliente: 'ACME CORP',
                        Codigo_Oportunidad: 'OPP-1'
                    },
                    III_Informacion_Candidato: { Nacionalidad: 'Colombiana' }
                }
            },
            payload_normalizado: {
                codigo: 'OPP-1',
                cliente: 'ACME CORP',
                empleador: 'ACME CORP',
                pais: 'Colombiana'
            }
        });
        assert.equal(rebuilt.normalized.codigo, '20250322');
        assert.equal(rebuilt.normalized.cliente, 'ACME CORP');
        assert.equal(rebuilt.normalized.empleador, undefined);
        assert.equal(rebuilt.normalized.pais, 'Colombia');
    });

    it('groupInboxByCedula agrupa por cédula y deja sin_match suelto', () => {
        const grouped = groupInboxByCedula([
            {
                id: 'a',
                status: 'pendiente',
                colaborador_cedula_match: '1024598286',
                tipo_novedad: 'salida',
                created_at: '2026-07-01T10:00:00Z',
                diff_count: 2
            },
            {
                id: 'b',
                status: 'pendiente',
                colaborador_cedula_match: '1024598286',
                tipo_novedad: 'modificacion_id',
                created_at: '2026-07-02T10:00:00Z',
                diff_count: 1
            },
            {
                id: 'c',
                status: 'pendiente',
                colaborador_cedula_match: '1024598286',
                tipo_novedad: 'extension',
                created_at: '2026-07-03T10:00:00Z',
                diff_count: 4
            },
            {
                id: 'd',
                status: 'sin_match',
                colaborador_cedula_match: null,
                tipo_novedad: 'salida',
                created_at: '2026-07-04T10:00:00Z',
                diff_count: 0
            }
        ]);
        assert.equal(grouped.length, 2);
        const grupo = grouped.find((g) => g.group_key === 'cedula:1024598286');
        assert.ok(grupo);
        assert.equal(grupo.fichas_count, 3);
        assert.equal(grupo.latest_id, 'c');
        assert.equal(grupo.diff_count, 4);
        assert.equal(grupo.fichas.length, 3);
        const solo = grouped.find((g) => g.id === 'd');
        assert.ok(solo);
        assert.equal(solo.fichas_count, 1);
    });

    it('getNovedadById recalcula diff contra colaboradores vivos', async () => {
        const id = '11111111-1111-1111-1111-111111111111';
        let updatedPayload = null;
        const pool = {
            query: async (sql, params) => {
                if (
                    String(sql).includes('FROM ficha_novedades_staging') &&
                    String(sql).includes('SELECT') &&
                    String(sql).includes('WHERE id =')
                ) {
                    return {
                        rows: [
                            {
                                id,
                                status: 'pendiente',
                                id_registro: '20250322',
                                colaborador_cedula_match: '1024598286',
                                payload_raw: {},
                                payload_normalizado: { puesto: 'Lead', cliente: 'ACME' },
                                diff_json: [{ field: 'puesto', before: 'Old', after: 'Lead' }]
                            }
                        ]
                    };
                }
                if (
                    String(sql).includes('FROM ficha_novedades_staging') &&
                    String(sql).includes('colaborador_cedula_match') &&
                    String(sql).includes("status = 'pendiente'")
                ) {
                    return {
                        rows: [
                            {
                                id,
                                tipo_novedad: 'salida',
                                status: 'pendiente',
                                diff_count: 1,
                                received_at: new Date(),
                                created_at: new Date()
                            }
                        ]
                    };
                }
                if (String(sql).includes('UPDATE ficha_novedades_staging')) {
                    updatedPayload = params[1];
                    return { rows: [] };
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
        assert.ok(updatedPayload);
        assert.equal(row.fichas_count, 1);
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
                // extension/modificacion filtran activo=true; salida/cancelacion no.
                if (!active && sql.includes('activo = true')) return { rows: [] };
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
            if (sql.includes('FROM colaboradores') && sql.includes('cedula = $1') && !active && sql.includes('activo = true')) {
                return { rows: [] };
            }
            if ((sql.includes('LOWER(TRIM(nombre))') || sql.includes('translate')) && !active && sql.includes('activo = true')) {
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
            if (sql.includes('FROM colaborador_contratos')) {
                return {
                    rows: [
                        {
                            id: '11111111-1111-4111-8111-111111111111',
                            cedula: '1024598286',
                            cliente: 'AVAL VALOR COMPARTIDO - AVC',
                            vigente: true,
                            es_cabecera: true,
                            fecha_termino: null
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
        assert.equal(r.match_strategy, 'codigo_contrato');
        assert.equal(r.match.cedula, '1024598286');
        assert.ok(r.diff_count >= 0);
        const insert = queries.find((q) => q.sql.includes('INSERT INTO ficha_novedades_staging'));
        assert.ok(insert);
        assert.equal(insert.params[10], 'pendiente');
        assert.equal(insert.params[17], 'codigo_contrato');
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
        assert.equal(r.match_strategy, 'codigo_contrato');
        assert.equal(r.match.codigo, '20250322');
        assert.ok(Array.isArray(r.diff_preview));
    });

    it('sin match si colaborador inactivo en extension (mismo codigo)', async () => {
        const payload = { ...buildDiegoDynamoItem(), tipo_novedad: 'extension' };
        const { pool } = createDiegoMockPool({ active: false });
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromHttp(payload);

        assert.equal(r.ok, true);
        assert.equal(r.status, 'sin_match');
        assert.equal(r.match_strategy, null);
        assert.equal(r.match, null);
    });

    it('salida hace match aunque colaborador esté inactivo', async () => {
        const payload = buildDiegoDynamoItem();
        const { pool } = createDiegoMockPool({ active: false });
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.ingestFromHttp(payload);

        assert.equal(r.ok, true);
        assert.equal(r.status, 'pendiente');
        assert.equal(r.match_strategy, 'codigo_contrato');
        assert.equal(r.match.cedula, '1024598286');
    });
});

describe('createFichaNovedadesService.listNovedades scope', () => {
    function createListMockPool() {
        const allRows = [
            {
                id: '1',
                status: 'pendiente',
                tipo_novedad: 'salida',
                created_at: new Date(),
                colaborador_cedula_match: '1024598286',
                payload_raw: {},
                payload_normalizado: { puesto: 'ANALISTA' },
                diff_json: [
                    { field: 'puesto', before: 'Analista', after: 'ANALISTA' },
                    { field: 'empleador', before: 'CINTE', after: 'ACME' }
                ]
            },
            { id: '2', status: 'sin_match', tipo_novedad: 'extension', created_at: new Date(), payload_raw: {}, payload_normalizado: {}, diff_json: [] },
            { id: '3', status: 'aplicado', tipo_novedad: 'salida', reviewed_at: new Date(), created_at: new Date(), diff_count: 1 },
            { id: '4', status: 'rechazado', tipo_novedad: 'extension', reviewed_at: new Date(), created_at: new Date(), diff_count: 0 }
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
                if (sql.includes('FROM colaboradores') && sql.includes('ANY')) {
                    return {
                        rows: [{ cedula: '1024598286', puesto: 'Analista', cliente: 'ACME', nombre: 'TEST' }]
                    };
                }
                if (sql.includes('FROM colaborador_contratos')) {
                    return { rows: [] };
                }
                if (sql.includes('UPDATE ficha_novedades_staging')) {
                    return { rows: [] };
                }
                const filtered = filterRows(allRows, sql, params);
                if (sql.includes('jsonb_array_length')) {
                    return {
                        rows: filtered.map((r) => ({
                            ...r,
                            diff_count: r.diff_count != null ? r.diff_count : parseDiffLen(r.diff_json)
                        }))
                    };
                }
                return { rows: filtered };
            }
        };

        function parseDiffLen(diffJson) {
            return Array.isArray(diffJson) ? diffJson.length : 0;
        }

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

    it('inbox recalcula diff_count vivo (ignora falsos cambios guardados)', async () => {
        const { pool, sqlLog } = createListMockPool();
        const svc = createFichaNovedadesService({ pool });
        const r = await svc.listNovedades({ scope: 'inbox' });
        const pendiente = r.items.find((i) => i.id === '1');
        assert.ok(pendiente);
        // Guardado tenía 2 filas (casing + empleador); vivo: puesto casefold = 0 cambios reales vs BD.
        assert.equal(pendiente.diff_count, 0);
        assert.ok(sqlLog.some((q) => q.sql.includes('UPDATE ficha_novedades_staging')));
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
        payload_normalizado: { fecha_termino: '2026-06-12', cliente: 'ACME' },
        diff_json: [{ field: 'fecha_termino', before: null, after: '2026-06-12' }],
        ...rowOverrides
    };
    const siblings = new Map();

    const pool = {
        query: async (sql, params) => {
            if (sql.includes('SELECT * FROM ficha_novedades_staging WHERE id')) {
                return { rows: [{ ...storedRow }] };
            }
            if (
                sql.includes('FROM ficha_novedades_staging') &&
                sql.includes('colaborador_cedula_match') &&
                sql.includes("status = 'pendiente'") &&
                sql.includes('jsonb_array_length')
            ) {
                const list = [
                    {
                        id: storedRow.id,
                        tipo_novedad: storedRow.tipo_novedad,
                        subject: storedRow.subject,
                        status: storedRow.status,
                        diff_count: Array.isArray(storedRow.diff_json) ? storedRow.diff_json.length : 0,
                        received_at: storedRow.received_at || new Date(),
                        created_at: storedRow.created_at || new Date(),
                        id_registro: storedRow.id_registro
                    },
                    ...[...siblings.values()].map((s) => ({
                        id: s.id,
                        tipo_novedad: s.tipo_novedad,
                        subject: s.subject,
                        status: s.status,
                        diff_count: 1,
                        received_at: s.received_at || new Date(),
                        created_at: s.created_at || new Date(),
                        id_registro: s.id_registro
                    }))
                ];
                return { rows: list.filter((r) => r.status === 'pendiente') };
            }
            if (sql.includes('SELECT * FROM colaboradores WHERE cedula')) {
                return {
                    rows: [
                        {
                            cedula: EDIT_CEDULA,
                            nombre: 'TEST USER',
                            cliente: 'ACME',
                            fecha_termino: null,
                            activo: true
                        }
                    ]
                };
            }
            if (sql.includes('cat_motivo_baja')) {
                return { rows: [{ motivo: 'Termino de Servicio' }] };
            }
            if (sql.includes('FROM colaborador_contratos') && sql.includes('SELECT')) {
                return {
                    rows: [
                        {
                            id: '11111111-1111-4111-8111-111111111111',
                            cedula: EDIT_CEDULA,
                            cliente: 'ACME',
                            vigente: true,
                            es_cabecera: true,
                            fecha_termino: '2026-01-01'
                        }
                    ]
                };
            }
            if (sql.includes('UPDATE colaborador_contratos')) {
                return { rowCount: 1, rows: [] };
            }
            if (sql.includes('UPDATE colaboradores')) {
                return { rows: [{ cedula: EDIT_CEDULA, activo: false }] };
            }
            if (sql.includes('UPDATE ficha_novedades_staging') && sql.includes('payload_normalizado')) {
                storedRow = {
                    ...storedRow,
                    payload_normalizado: JSON.parse(params[1]),
                    diff_json: JSON.parse(params[2]),
                    reviewed_by: params[3] != null ? params[3] : storedRow.reviewed_by
                };
                return { rows: [] };
            }
            if (sql.includes("status = 'aplicado'")) {
                storedRow = { ...storedRow, status: 'aplicado' };
                return { rows: [] };
            }
            if (
                sql.includes("status = 'rechazado'") &&
                sql.includes('colaborador_cedula_match') &&
                sql.includes('id <>')
            ) {
                const closed = [];
                for (const [sid, s] of siblings.entries()) {
                    if (s.status === 'pendiente') {
                        s.status = 'rechazado';
                        s.error = params[3];
                        closed.push({ id: sid });
                    }
                }
                return { rows: closed, rowCount: closed.length };
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
        getStored: () => storedRow,
        addSibling: (row) => {
            siblings.set(row.id, { status: 'pendiente', tipo_novedad: 'modificacion_id', ...row });
        },
        getSibling: (id) => siblings.get(id)
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
            (err) => err.status === 400 && /no permitido|no editable/i.test(err.message)
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
        assert.equal(result.siblings_closed, 0);
        assert.equal(appliedPatch, null);
    });

    it('closeSiblings rechaza hermanas pendientes del mismo colaborador', async () => {
        const siblingId = '00000000-0000-4000-8000-000000000099';
        const { pool, addSibling, getSibling } = createUpdateNovedadMockPool();
        addSibling({ id: siblingId, colaborador_cedula_match: EDIT_CEDULA });
        const svc = createFichaNovedadesService({
            pool,
            updateColaboradorByCedula: async (cedula) => ({ cedula })
        });

        const result = await svc.approveNovedad(
            NOVEDAD_EDIT_ID,
            { email: 'reviewer@test.com' },
            { closeSiblings: true }
        );

        assert.equal(result.ok, true);
        assert.equal(result.siblings_closed, 1);
        assert.equal(getSibling(siblingId).status, 'rechazado');
        assert.equal(getSibling(siblingId).error, SIBLING_CLOSE_REASON);
    });

    it('sin closeSiblings deja hermanas en pendiente', async () => {
        const siblingId = '00000000-0000-4000-8000-000000000098';
        const { pool, addSibling, getSibling } = createUpdateNovedadMockPool();
        addSibling({ id: siblingId, colaborador_cedula_match: EDIT_CEDULA });
        const svc = createFichaNovedadesService({
            pool,
            updateColaboradorByCedula: async (cedula) => ({ cedula })
        });

        const result = await svc.approveNovedad(NOVEDAD_EDIT_ID, { email: 'reviewer@test.com' }, {
            closeSiblings: false
        });

        assert.equal(result.siblings_closed, 0);
        assert.equal(getSibling(siblingId).status, 'pendiente');
    });
});

describe('AUT-338 apply_fields al aprobar ficha Zoho', () => {
    it('solo escribe los campos marcados', async () => {
        const { pool } = createUpdateNovedadMockPool({
            tipo_novedad: 'modificacion_id',
            payload_normalizado: {
                puesto: 'Lead',
                tarifa_cliente: 20000000,
                cliente: 'ACME'
            }
        });
        let appliedPatch = null;
        const svc = createFichaNovedadesService({
            pool,
            updateColaboradorByCedula: async (cedula, patch) => {
                appliedPatch = { cedula, patch };
                return { cedula };
            }
        });

        const result = await svc.approveNovedad(NOVEDAD_EDIT_ID, { email: 'reviewer@test.com' }, {
            applyFields: ['puesto']
        });

        assert.equal(result.ok, true);
        assert.ok(appliedPatch);
        assert.equal(appliedPatch.patch.puesto, 'Lead');
        assert.equal(appliedPatch.patch.tarifa_cliente, undefined);
        assert.equal(appliedPatch.patch.cliente, undefined);
    });

    it('sin ningún campo marcado no aprueba', async () => {
        const { pool } = createUpdateNovedadMockPool();
        const svc = createFichaNovedadesService({
            pool,
            updateColaboradorByCedula: async (cedula) => ({ cedula })
        });
        await assert.rejects(
            () => svc.approveNovedad(NOVEDAD_EDIT_ID, { email: 'reviewer@test.com' }, { applyFields: [] }),
            (err) => err.status === 400
        );
    });
});
