const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    flattenExtractorOutput,
    EXTRACTOR_PATH_MAP,
    getByPath,
    nacionalidadToPais
} = require('../src/contratacion/extractorToFichaMap');

function loadSampleOutput() {
    const p = path.join(__dirname, 'fixtures/exec-11259-detail.json');
    const raw = fs.readFileSync(p, 'utf8');
    const doc = JSON.parse(raw);
    const run = doc?.data?.resultData?.runData?.['Agente Extractor Ficha']?.[0]?.data?.main?.[0]?.[0]?.json?.output;
    assert.ok(run, 'sample output from exec-11259');
    return run;
}

describe('extractorToFichaMap', () => {
    it('defines at least 85 extractor path mappings', () => {
        assert.ok(EXTRACTOR_PATH_MAP.length >= 85);
    });

    it('flattens exec-11259 sample with key fields', () => {
        const output = loadSampleOutput();
        const flat = flattenExtractorOutput(output);
        assert.equal(flat.nombre, 'Diego Andres Contreras Camargo');
        assert.equal(flat.cedula, '1010170944');
        assert.equal(flat.cliente, 'EXPERIAN COLOMBIA');
        assert.equal(flat.puesto, 'Lider Vulnerabilidades Windows');
        assert.equal(flat.emergencia_1_nombre, 'Maria Alejandra Amaya');
        assert.ok(flat.funciones_puesto && flat.funciones_puesto.includes('Windows Server'));
        assert.equal(flat.contacto_focal_1_nombre, 'Oscar Cisternas');
        assert.equal(flat.consideraciones_gch, 'Contrato Termino indefinido');
        assert.ok(flat.primer_contacto_familiar.includes('Maria Alejandra Amaya'));
    });

    it('getByPath reads nested blocks', () => {
        const output = loadSampleOutput();
        assert.equal(getByPath(output, 'I_Informacion_General.Cliente'), 'EXPERIAN COLOMBIA');
    });

    it('no mapea Cliente a empleador ni Codigo_Oportunidad a codigo', () => {
        const flat = flattenExtractorOutput({
            ID_Registro: '20250322',
            I_Informacion_General: {
                Cliente: 'ACME CORP',
                Codigo_Oportunidad: 'OPP-999',
                Modalidad_Asignacion: 'Presencial',
                Servicio: 'Frente X'
            },
            II_Informacion_Financiera: {
                Doc_Soporte_Venta: 'OC-123'
            },
            IV_Informacion_Contratacion: {
                Esquema_Contratacion: 'Contrato Indefinido'
            }
        });
        assert.equal(flat.codigo, '20250322');
        assert.equal(flat.cliente, 'ACME CORP');
        assert.equal(flat.empleador, undefined);
        assert.equal(flat.modalidad_contrato, 'Presencial');
        assert.equal(flat.tipo_contrato, 'Contrato Indefinido');
        assert.equal(flat.esquema_contrato, undefined);
        assert.equal(flat.frente_proyecto, 'Frente X');
        assert.notEqual(flat.tipo_contrato, 'OC-123');
    });

    it('nacionalidadToPais canoniza Colombiana → Colombia', () => {
        assert.equal(nacionalidadToPais('Colombiana'), 'Colombia');
        const flat = flattenExtractorOutput({
            III_Informacion_Candidato: { Nacionalidad: 'Colombiana' }
        });
        assert.equal(flat.pais, 'Colombia');
    });

    it('Contacto Focal 1 no se mapea a gerente_servicio (es contacto del cliente)', () => {
        const flat = flattenExtractorOutput({
            VI_Stakeholders: {
                Contacto_Focal_1_Nombre: 'Norman Romero',
                Contacto_Focal_1_Email: 'noromero@bancofalabella.com.co'
            }
        });
        assert.equal(flat.contacto_focal_1_nombre, 'Norman Romero');
        assert.equal(flat.contacto_focal_1_email, 'noromero@bancofalabella.com.co');
        assert.equal(flat.gerente_servicio, undefined);
        assert.equal(flat.email_gerente_servicio, undefined);
    });
});
