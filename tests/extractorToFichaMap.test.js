const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    flattenExtractorOutput,
    EXTRACTOR_PATH_MAP,
    getByPath
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
});
