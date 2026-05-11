'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const {
    buildHoraExtraExportSlices,
    compensacionDominicalExcelEtiqueta,
    formatTipoNovedadHeSlice
} = require('../src/novedadHeExcelExport');

describe('novedadHeExcelExport', () => {
    it('desagrega HE en un slice por cada componente con horas', () => {
        const it = {
            tipoNovedad: 'Hora Extra',
            horasDiurnas: 2,
            horasNocturnas: 1.5,
            horasRecargoDomingoDiurnas: 0.5,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it);
        assert.equal(slices.length, 3);
        assert.equal(slices[0].sliceKey, 'diurna');
        assert.equal(slices[0].hours, 2);
        assert.equal(slices[1].sliceKey, 'nocturna');
        assert.equal(slices[2].sliceKey, 'recargo_diurno');
    });

    it('con marcador tiempo: compensación en todas las filas incl. diurna', () => {
        const obs = '[HE_DOMINGO_COMP] modo=tiempo; trabajado=2026-04-26; compensatorio=2026-04-29';
        assert.equal(compensacionDominicalExcelEtiqueta(obs, 'diurna'), 'Compensado en tiempo');
        assert.equal(compensacionDominicalExcelEtiqueta(obs, 'recargo_nocturno'), 'Compensado en tiempo');
    });

    it('sin marcador y slice recargo: sin compensación registrada', () => {
        assert.equal(compensacionDominicalExcelEtiqueta('', 'recargo_diurno'), 'Sin compensación registrada');
    });

    it('sin marcador y slice diurna: no aplica', () => {
        assert.equal(compensacionDominicalExcelEtiqueta('', 'diurna'), 'No aplica (tramo no recargo dominical)');
    });

    it('formatTipoNovedadHeSlice añade sufijo dominical', () => {
        const it = {
            tipoNovedad: 'Hora Extra',
            heDomingoObservacion: '[HE_DOMINGO_COMP] modo=dinero; trabajado=2026-04-05'
        };
        const s = formatTipoNovedadHeSlice(it, 'Hora Diurna');
        assert.ok(s.includes('Hora Extra / Hora Diurna'));
        assert.ok(s.includes('Dominical'));
    });

    it('null slices cuando no hay componentes > 0', () => {
        const it = {
            tipoNovedad: 'Hora Extra',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0
        };
        assert.equal(buildHoraExtraExportSlices(it), null);
    });

    it('con dep: HE diurna/nocturna en domingo Bogotá llevan «dominical» en etiqueta Excel', () => {
        const dep = { toUtcMsFromDateAndTime };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-03-01',
            fechaFin: '2026-03-01',
            horaInicio: '09:00',
            horaFin: '22:00',
            horasDiurnas: 2.67,
            horasNocturnas: 3,
            horasRecargoDomingoDiurnas: 7.33,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 7.33,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const di = slices.find((s) => s.sliceKey === 'diurna');
        const no = slices.find((s) => s.sliceKey === 'nocturna');
        const rd = slices.find((s) => s.sliceKey === 'recargo_diurno');
        assert.ok(di);
        assert.ok(no);
        assert.ok(rd);
        assert.match(di.tipoLabel, /dominical/i);
        assert.match(no.tipoLabel, /dominical/i);
        assert.match(rd.tipoLabel, /Recargo dominical diurno/);
    });
});
