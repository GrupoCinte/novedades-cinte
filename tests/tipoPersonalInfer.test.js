const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    inferTipoPersonal,
    isClienteCinte,
    extractCedulaFromRecord
} = require('../src/onboarding/tipoPersonalInfer');

describe('inferTipoPersonal', () => {
    it('CINTE gana sobre consultor ya guardado; SENA se queda', () => {
        assert.equal(inferTipoPersonal({ tipo_personal: 'consultor', cliente: 'CINTE' }), 'staff');
        assert.equal(inferTipoPersonal({ tipo_personal: 'staff', cliente: 'PORVENIR' }), 'staff');
        assert.equal(inferTipoPersonal({ tipo_personal: 'sena', cliente: 'CINTE' }), 'sena');
    });

    it('Staff CINTE va a staff si no hay tipo', () => {
        assert.equal(inferTipoPersonal({ cliente: 'CINTE' }), 'staff');
        assert.equal(inferTipoPersonal({ cliente: 'Grupo CINTE' }), 'staff');
        assert.equal(inferTipoPersonal({ cliente: 'CINTE SAS' }), 'staff');
    });

    it('no trata un cliente de terceros como CINTE', () => {
        assert.equal(isClienteCinte('BANCO DE BOGOTÁ'), false);
        assert.equal(inferTipoPersonal({ cliente: 'PORVENIR' }), 'consultor');
        assert.equal(inferTipoPersonal({ cliente: 'CONSORCIO CINTE XYZ' }), 'consultor');
    });

    it('SENA gana sobre cliente CINTE', () => {
        assert.equal(inferTipoPersonal({ cliente: 'CINTE', tipo_contrato: 'SENA productivo' }), 'sena');
        assert.equal(inferTipoPersonal({ cliente: 'PORVENIR', puesto: 'Aprendiz SENA' }), 'sena');
    });

    it('extrae cédula de ficha o de fullData', () => {
        assert.equal(extractCedulaFromRecord({ cedula: '1.017.123.456' }), '1017123456');
        assert.equal(extractCedulaFromRecord({ fullData: { Identificacion_Numero: 800123 } }), '800123');
    });
});
