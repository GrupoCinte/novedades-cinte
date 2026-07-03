'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const { HE_TIPO_CANONICO } = require('../src/novedadHeTipoCatalog');
const {
    buildHoraExtraExportSlices,
    compensacionDominicalExcelEtiqueta,
    formatTipoNovedadHeSlice,
    buildHeLaboralDomingoSlices
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
        assert.equal(slices[0].sliceKey, 'diurna_laboral');
        assert.equal(slices[0].hours, 2);
        assert.equal(slices[0].tipoLabel, HE_TIPO_CANONICO.HE_DIURNA);
        assert.equal(slices[1].sliceKey, 'nocturna_laboral');
        assert.equal(slices[2].sliceKey, 'recargo_diurno');
        assert.equal(slices[2].tipoLabel, `${HE_TIPO_CANONICO.REC_DOM_DIURNO} — sin compensatorio`);
    });

    it('con marcador tiempo: compensación en todas las filas incl. diurna', () => {
        const obs = '[HE_DOMINGO_COMP] modo=tiempo; trabajado=2026-04-26; compensatorio=2026-04-29';
        assert.equal(compensacionDominicalExcelEtiqueta(obs, 'diurna'), 'Compensado en tiempo');
        assert.equal(compensacionDominicalExcelEtiqueta(obs, 'recargo_nocturno'), 'Compensado en tiempo');
    });

    it('sin marcador y slice recargo: sin compensación registrada', () => {
        assert.equal(compensacionDominicalExcelEtiqueta('', 'recargo_diurno'), 'Sin compensación registrada');
    });

    it('sin marcador y slice diurna laboral: no aplica', () => {
        assert.equal(compensacionDominicalExcelEtiqueta('', 'diurna_laboral'), 'No aplica (tramo no recargo dominical)');
    });

    it('formatTipoNovedadHeSlice malla origen usa etiqueta canónica sin prefijo Recargo', () => {
        const it = {
            tipoNovedad: 'Hora Extra',
            mallaOrigenRef: 'Cliente|mallas|2026-06-10|22_06|123',
            heDomingoObservacion: ''
        };
        const slice = {
            sliceKey: 'recargo_nocturno_ordinario',
            tipoLabel: `${HE_TIPO_CANONICO.REC_NOCTURNO}`,
            hours: 8,
            columnKey: 'horasRecargoNocturno'
        };
        const s = formatTipoNovedadHeSlice(it, slice);
        assert.equal(s, HE_TIPO_CANONICO.REC_NOCTURNO);
        assert.ok(!s.includes('Recargo /'));
        assert.ok(!s.includes('Hora Extra /'));
    });

    it('buildHoraExtraExportSlices incluye recargo nocturno ordinario malla', () => {
        const item = {
            tipoNovedad: 'Hora Extra',
            mallaOrigenRef: 'Cliente|mallas|2026-06-10|22_06|123',
            horasRecargoNocturno: 8,
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(item);
        assert.equal(slices.length, 1);
        assert.equal(slices[0].sliceKey, 'recargo_nocturno_ordinario');
        assert.equal(slices[0].hours, 8);
        assert.equal(formatTipoNovedadHeSlice(item, slices[0]), HE_TIPO_CANONICO.REC_NOCTURNO);
    });

    it('formatTipoNovedadHeSlice añade sufijo con compensatorio en dominical', () => {
        const it = {
            tipoNovedad: 'Hora Extra',
            heDomingoObservacion: '[HE_DOMINGO_COMP] modo=tiempo; trabajado=2026-04-05; compensatorio=2026-04-08'
        };
        const slice = {
            sliceKey: 'diurna_dominical',
            tipoLabel: `${HE_TIPO_CANONICO.HE_DIURNA_DOM} — con compensatorio`,
            hours: 2,
            columnKey: 'horasDiurnas'
        };
        const s = formatTipoNovedadHeSlice(it, slice);
        assert.ok(s.includes(HE_TIPO_CANONICO.HE_DIURNA_DOM));
        assert.ok(s.includes('con compensatorio'));
        assert.ok(!s.includes('Dominical compensado'));
    });

    it('modo=dinero en dominical → sin compensatorio', () => {
        const it = {
            tipoNovedad: 'Hora Extra',
            heDomingoObservacion: '[HE_DOMINGO_COMP] modo=dinero; trabajado=2026-04-05'
        };
        const slices = buildHoraExtraExportSlices({
            ...it,
            horasRecargoDomingoDiurnas: 3,
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0
        });
        assert.equal(slices[0].tipoLabel, `${HE_TIPO_CANONICO.REC_DOM_DIURNO} — sin compensatorio`);
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

    it('con dep: HE en domingo genera fila dominical canónica', () => {
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
        const diDom = slices.find((s) => s.sliceKey === 'diurna_dominical');
        const noDom = slices.find((s) => s.sliceKey === 'nocturna_dominical');
        const rd = slices.find((s) => s.sliceKey === 'recargo_diurno');
        assert.ok(diDom);
        assert.ok(noDom);
        assert.ok(rd);
        assert.equal(diDom.tipoLabel, `${HE_TIPO_CANONICO.HE_DIURNA_DOM} — sin compensatorio`);
        assert.equal(rd.tipoLabel, `${HE_TIPO_CANONICO.REC_DOM_DIURNO} — sin compensatorio`);
    });

    it('con dep: HE mixto sábado+domingo divide en laboral y dominical', () => {
        const dep = { toUtcMsFromDateAndTime };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-03-07',
            fechaFin: '2026-03-08',
            horaInicio: '18:00',
            horaFin: '10:00',
            horasDiurnas: 5,
            horasNocturnas: 4,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const diLaboral = slices.find((s) => s.sliceKey === 'diurna_laboral');
        const diDom = slices.find((s) => s.sliceKey === 'diurna_dominical');
        assert.ok(diLaboral || diDom);
        if (diLaboral && diDom) {
            assert.equal(diLaboral.tipoLabel, HE_TIPO_CANONICO.HE_DIURNA);
            assert.equal(diDom.tipoLabel, `${HE_TIPO_CANONICO.HE_DIURNA_DOM} — sin compensatorio`);
            assert.ok(Math.abs(diLaboral.hours + diDom.hours - 5) < 0.1);
        }
    });

    it('buildHeLaboralDomingoSlices solo domingo genera fila dominical', () => {
        const slices = buildHeLaboralDomingoSlices('diurna', 3, 3, 'horasDiurnas', '');
        assert.equal(slices.length, 1);
        assert.equal(slices[0].sliceKey, 'diurna_dominical');
        assert.equal(slices[0].tipoLabel, `${HE_TIPO_CANONICO.HE_DIURNA_DOM} — sin compensatorio`);
    });
});
