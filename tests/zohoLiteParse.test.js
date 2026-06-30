const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    enrichSubjectClassify,
    buildLiteExtractorOutput,
    buildFlatFieldsFromExtractorOutput,
    buildZohoDynamoItem,
    parseClienteFromSalidaSubject,
    extractIdRegistro,
    extractCedula
} = require('../src/onboarding/zohoLiteParse');

const DIEGO_SUBJECT =
    'Notificación de Salida de Diego Alberto Nuñez Sanchez - AVAL VALOR COMPARTIDO - AVC (Jun 12, 2026)';

const DIEGO_BODY = `
Notificación de Salida de Diego Alberto Nuñez Sanchez.
ID de Registro: 20250322
Estimados,
Cliente AVAL VALOR COMPARTIDO - AVC Sin Dato
Consultor Asignado Diego Alberto Nuñez Sanchez Persona Natural
Cédula de Ciudadanía: 1024598286
Cargo Lider Implementacion
Fecha de salida Jun 12, 2026
Duración Total 7,8 meses
`;

describe('zohoLiteParse', () => {
    it('parseClienteFromSalidaSubject extrae cliente del asunto', () => {
        assert.equal(
            parseClienteFromSalidaSubject(DIEGO_SUBJECT),
            'AVAL VALOR COMPARTIDO - AVC'
        );
    });

    it('extractIdRegistro y cedula del cuerpo Diego Alberto', () => {
        assert.equal(extractIdRegistro(DIEGO_BODY, ''), '20250322');
        assert.equal(extractCedula(DIEGO_BODY), '1024598286');
    });

    it('enrichSubjectClassify completa cliente en salida', () => {
        const r = enrichSubjectClassify({
            subject: DIEGO_SUBJECT,
            tipoNovedadZoho: 'salida',
            nombreAsunto: 'diego alberto nunez sanchez',
            idRegistroZoho: null,
            clienteAsunto: null
        });
        assert.equal(r.clienteAsunto, 'AVAL VALOR COMPARTIDO - AVC');
    });

    it('buildLiteExtractorOutput Diego Alberto — codigo, cedula, fecha, cliente, nombre', () => {
        const enriched = enrichSubjectClassify({
            subject: DIEGO_SUBJECT,
            tipoNovedadZoho: 'salida',
            nombreAsunto: 'Diego Alberto Nuñez Sanchez',
            idRegistroZoho: null,
            clienteAsunto: parseClienteFromSalidaSubject(DIEGO_SUBJECT)
        });

        const output = buildLiteExtractorOutput({
            tipo: 'salida',
            subject: DIEGO_SUBJECT,
            bodyPreview: DIEGO_BODY,
            idRegistroZoho: enriched.idRegistroZoho,
            nombreAsunto: enriched.nombreAsunto,
            clienteAsunto: enriched.clienteAsunto
        });

        assert.equal(output.ID_Registro, '20250322');
        assert.equal(output.III_Informacion_Candidato.Identificacion_Numero, '1024598286');
        assert.equal(output.III_Informacion_Candidato.Nombre, 'DIEGO ALBERTO NUÑEZ SANCHEZ');
        assert.equal(output.I_Informacion_General.Cliente, 'AVAL VALOR COMPARTIDO - AVC');
        assert.match(output.I_Informacion_General.Fecha_Salida, /Jun 12, 2026/i);
        assert.equal(output.IV_Informacion_Contratacion.Puesto_Cargo, 'LIDER IMPLEMENTACION');

        const flat = buildFlatFieldsFromExtractorOutput(output);
        assert.equal(flat.codigo, '20250322');
        assert.equal(flat.cedula, '1024598286');
        assert.ok(flat.fecha_termino);
    });

    it('buildZohoDynamoItem usa sentinela nada y campos planos', () => {
        const output = buildLiteExtractorOutput({
            tipo: 'salida',
            subject: DIEGO_SUBJECT,
            bodyPreview: DIEGO_BODY,
            nombreAsunto: 'Diego Alberto Nuñez Sanchez',
            clienteAsunto: 'AVAL VALOR COMPARTIDO - AVC'
        });

        const item = buildZohoDynamoItem({
            output,
            classify: { tipoNovedadZoho: 'salida', subject: DIEGO_SUBJECT },
            msgId: '<test-msg-id>',
            executionId: '999',
            zohoLiteExtract: true
        });

        assert.equal(item.id_registro, '20250322');
        assert.equal(item.codigo, '20250322');
        assert.equal(item.cedula, '1024598286');
        assert.ok(item.whatsapp_number.startsWith('zoho_novedad#'));
        assert.equal(item['nombre y apellido'], 'DIEGO ALBERTO NUÑEZ SANCHEZ');
        const parsed = JSON.parse(item.parsed_subject);
        assert.equal(parsed.id_registro, '20250322');
    });
});
