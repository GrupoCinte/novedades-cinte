/**
 * Validación Opción A — 6 asuntos reales Zoho (classify + build campos planos).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildLiteExtractorOutput,
    buildZohoDynamoItem,
    classifySubject
} = require('../src/onboarding/zohoLiteParse');

const CASES = [
    {
        id: 'salida-diego',
        subject:
            'Notificación de Salida de Diego Alberto Nuñez Sanchez - AVAL VALOR COMPARTIDO - AVC (Jun 12, 2026)',
        tipo: 'salida',
        idFromSubject: null,
        body: `ID de Registro: 20250322
Cliente AVAL VALOR COMPARTIDO - AVC Sin Dato
Consultor Asignado Diego Alberto Nuñez Sanchez Persona Natural
Cédula de Ciudadanía: 1024598286
Fecha de salida Jun 12, 2026`,
        expectCodigo: '20250322',
        expectCedula: '1024598286',
        expectCliente: 'AVC',
        matchBy: 'codigo'
    },
    {
        id: 'integracion-laura',
        subject:
            'Notificación de Integración 20260618 - Laura Patricia Rodriguez Naranjo -AGENCIA DE SEGUROS FALABELLA LTDA (Jun 24, 2026)',
        tipo: 'integracion',
        idFromSubject: '20260618',
        body: 'ID de Registro: 20260618',
        expectCodigo: '20260618',
        mvp: true
    },
    {
        id: 'extension-juan',
        subject: 'Notificación de Extensión - Juan Manuel Meneses Rueda/ CLARO',
        tipo: 'extension',
        idFromSubject: null,
        body: `ID de Registro: 20123456
Cliente CLARO Sin Dato
Consultor Asignado Juan Manuel Meneses Rueda Persona Natural
Cédula: 1234567890
Fecha de salida Dec 31, 2026
Duración Total 12 meses`,
        expectCodigo: '20123456',
        expectCliente: 'CLARO',
        matchBy: 'nombre+cliente'
    },
    {
        id: 'modificacion-catalina',
        subject: 'Modificación sobre ID 20250078 - Catalina María Robledo Sánchez-XM (abr 14, 2025)',
        tipo: 'modificacion_id',
        idFromSubject: '20250078',
        body: 'ID de Registro: 20250078',
        expectCodigo: '20250078',
        mvp: true
    },
    {
        id: 'cancel-ingreso-snneider',
        subject:
            'Cancelación de Ingreso 20260605 - Snneider Joan Anderson Pinzón Amaya -EXPERIAN COLOMBIA',
        tipo: 'cancelacion_ingreso',
        idFromSubject: '20260605',
        body: 'ID de Registro: 20260605',
        expectCodigo: '20260605',
        matchBy: 'codigo'
    },
    {
        id: 'cancel-salida-jhon',
        subject:
            'CANCELACIÓN//Notificación de Salida de Jhon Fredy Arias Espitia - CLARO (jun 5, 2026)',
        tipo: 'cancelacion_salida',
        idFromSubject: null,
        body: `Consultor Asignado Jhon Fredy Arias Espitia Persona Natural
Cliente CLARO Sin Dato
Fecha de salida Jun 5, 2026`,
        expectCliente: 'CLARO',
        matchBy: 'nombre+cliente'
    }
];

describe('zoho classifySubject — extensión sin barra', () => {
    it('clasifica extensión con guión antes del cliente', () => {
        const cls = classifySubject('Notificación de Extensión - Juan Manuel Meneses Rueda - CLARO');
        assert.equal(cls.tipo, 'extension');
        assert.ok(cls.nombreAsunto?.includes('Juan'));
        assert.ok(cls.clienteAsunto?.includes('CLARO'));
        assert.equal(cls.debeProcesarNovedadZoho, true);
    });
});

describe('zoho six cases — Opción A parseo', () => {
    for (const c of CASES) {
        it(`${c.id}: classify + campos planos`, () => {
            const cls = classifySubject(c.subject);
            assert.equal(cls.tipo, c.tipo, `tipo esperado ${c.tipo}`);

            if (c.idFromSubject) {
                assert.equal(cls.idRegistroZoho, c.idFromSubject);
            }

            if (c.mvp) {
                const output = { ID_Registro: c.expectCodigo };
                const item = buildZohoDynamoItem({
                    output,
                    classify: {
                        tipoNovedadZoho: c.tipo,
                        subject: c.subject,
                        idRegistroZoho: c.idFromSubject
                    },
                    msgId: `test-${c.id}`,
                    executionId: '1'
                });
                assert.equal(item.codigo, c.expectCodigo);
                assert.notEqual(item.id_registro, 'nada');
                return;
            }

            const output = buildLiteExtractorOutput({
                tipo: c.tipo,
                subject: c.subject,
                bodyHtml: c.body,
                idRegistroZoho: cls.idRegistroZoho,
                nombreAsunto: cls.nombreAsunto,
                clienteAsunto: cls.clienteAsunto
            });

            if (c.expectCodigo) assert.equal(output.ID_Registro, c.expectCodigo);
            if (c.expectCedula) {
                assert.equal(output.III_Informacion_Candidato?.Identificacion_Numero, c.expectCedula);
            }
            if (c.expectCliente) {
                assert.ok(
                    output.I_Informacion_General?.Cliente?.includes(c.expectCliente.split(' ')[0]),
                    `cliente debe contener ${c.expectCliente}`
                );
            }

            const item = buildZohoDynamoItem({
                output,
                classify: {
                    tipoNovedadZoho: c.tipo,
                    subject: c.subject,
                    nombreAsunto: cls.nombreAsunto,
                    clienteAsunto: cls.clienteAsunto,
                    idRegistroZoho: cls.idRegistroZoho
                },
                msgId: `test-${c.id}`,
                executionId: '1',
                zohoLiteExtract: true
            });

            assert.equal(item.record_type, 'zoho_novedad');
            assert.ok(item.whatsapp_number.startsWith('zoho_novedad#'));
            if (c.expectCodigo) assert.equal(item.codigo, c.expectCodigo);
            if (c.expectCodigo) assert.equal(item.id_registro, c.expectCodigo);
        });
    }
});
