'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    formatCantidadNovedad,
    formatCantidadNovedadExcelPlain,
    medidaExcelLabel
} = require('../src/novedadCantidadFormat');

describe('novedadCantidadFormat Excel', () => {
    it('formatCantidadNovedad mantiene sufijo h en UI', () => {
        assert.equal(formatCantidadNovedad('Hora Extra', 2.67, {}), '2.67h');
    });

    it('formatCantidadNovedadExcelPlain devuelve número sin sufijo', () => {
        assert.equal(formatCantidadNovedadExcelPlain(2.67, 'hours'), 2.67);
        assert.equal(formatCantidadNovedadExcelPlain(3, 'days'), 3);
        assert.equal(formatCantidadNovedadExcelPlain(150000, 'money'), 150000);
        assert.equal(formatCantidadNovedadExcelPlain(0, 'hours'), '');
    });

    it('medidaExcelLabel etiqueta unidad para export', () => {
        assert.equal(medidaExcelLabel('hours'), 'Horas');
        assert.equal(medidaExcelLabel('days'), 'Días');
        assert.equal(medidaExcelLabel('money'), 'COP');
        assert.equal(medidaExcelLabel('neutral'), '');
    });
});
