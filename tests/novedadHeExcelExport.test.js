'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const { HE_TIPO_CANONICO } = require('../src/novedadHeTipoCatalog');
const {
    buildHoraExtraExportSlices,
    compensacionDominicalExcelEtiqueta,
    formatTipoNovedadHeSlice,
    buildHeLaboralDomingoSlices,
    msRangeToExcelHoraFields
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

    it('msRangeToExcelHoraFields respeta frontera exclusiva en fin', () => {
        const dep = { toUtcMsFromDateAndTime };
        const startMs = toUtcMsFromDateAndTime('2026-03-01', '06:00');
        const endMs = toUtcMsFromDateAndTime('2026-03-01', '19:00');
        const fields = msRangeToExcelHoraFields(startMs, endMs);
        assert.equal(fields.fechaInicio, '2026-03-01');
        assert.equal(fields.fechaFin, '2026-03-01');
        assert.equal(fields.horaInicial, '06:00');
        assert.equal(fields.horaFinal, '18:59');
    });

    it('con dep: cada slice HE tiene franja horaria distinta al rango global', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
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
        assert.ok(slices.length >= 3);
        for (const slice of slices) {
            assert.ok(slice.startMs != null && slice.endMs != null, `slice ${slice.sliceKey} sin rango`);
        }
        const signatures = slices.map((s) => {
            const r = msRangeToExcelHoraFields(s.startMs, s.endMs);
            return `${r.fechaInicio} ${r.horaInicial}–${r.fechaFin} ${r.horaFinal}`;
        });
        assert.equal(new Set(signatures).size, signatures.length, 'franjas repetidas: ' + signatures.join(' | '));
        const allGlobal = slices.every((s) => {
            const r = msRangeToExcelHoraFields(s.startMs, s.endMs);
            return r.horaInicial === '09:00' && r.horaFinal === '22:00';
        });
        assert.equal(allGlobal, false);
    });

    it('con dep: HE sábado→domingo asigna franjas laboral y dominical consecutivas', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
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
        assert.ok(diLaboral?.startMs != null);
        assert.ok(diDom?.startMs != null);
        const rLab = msRangeToExcelHoraFields(diLaboral.startMs, diLaboral.endMs);
        const rDom = msRangeToExcelHoraFields(diDom.startMs, diDom.endMs);
        assert.equal(rLab.fechaInicio, '2026-03-07');
        assert.equal(rDom.fechaInicio, '2026-03-08');
        assert.notEqual(`${rLab.horaInicial}-${rLab.horaFinal}`, `${rDom.horaInicial}-${rDom.horaFinal}`);
    });

    it('AUT-587 A: sobrante en lunes festivo se exporta como HE Diurna Dominical', () => {
        const festivosSet = new Set(['2026-07-20']);
        const dep = { toUtcMsFromDateAndTime, festivosSet };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-07-20',
            fechaFin: '2026-07-20',
            horaInicio: '07:00',
            horaFin: '16:30',
            horasDiurnas: 2.5,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 7,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 7,
            horasRecargoNocturno: 0,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const diDom = slices.find((s) => s.sliceKey === 'diurna_dominical');
        const diLab = slices.find((s) => s.sliceKey === 'diurna_laboral');
        assert.ok(diDom, 'debe existir slice diurna_dominical');
        assert.equal(diLab, undefined);
        assert.equal(diDom.hours, 2.5);
        assert.equal(diDom.tipoLabel, `${HE_TIPO_CANONICO.HE_DIURNA_DOM} — sin compensatorio`);
    });

    it('AUT-587 B: HE nocturna que cruza medianoche une franja a la cantidad', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-07-24',
            fechaFin: '2026-07-25',
            horaInicio: '22:00',
            horaFin: '01:00',
            horasDiurnas: 0,
            horasNocturnas: 3,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            horasRecargoNocturno: 0,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const noc = slices.find((s) => s.sliceKey === 'nocturna_laboral' || s.sliceKey === 'nocturna_dominical');
        assert.ok(noc?.startMs != null && noc?.endMs != null);
        const durH = (noc.endMs - noc.startMs) / (60 * 60 * 1000);
        assert.ok(Math.abs(durH - 3) < 0.05, `duración ${durH} != 3`);
        const fields = msRangeToExcelHoraFields(noc.startMs, noc.endMs);
        assert.equal(fields.horaInicial, '22:00');
        assert.equal(fields.fechaFin, '2026-07-25');
        assert.notEqual(fields.horaFinal, '23:59');
    });

    it('AUT-587 C: vuelto rn tras tope recargo → HE Nocturna Dominical con horario ~1h', () => {
        const festivosSet = new Set(['2026-07-20']);
        const dep = { toUtcMsFromDateAndTime, festivosSet };
        const it = {
            tipoNovedad: 'Hora Extra',
            mallaOrigenRef: 'EXPERIAN|nocturnos|2026-07-20|x|1',
            fechaInicio: '2026-07-20',
            fechaFin: '2026-07-20',
            horaInicio: '14:00',
            horaFin: '22:00',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 5,
            horasRecargoDomingoNocturnas: 2,
            horasRecargoDomingo: 7,
            horasRecargoNocturno: 1,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const vuelto = slices.find((s) => s.columnKey === 'horasRecargoNocturno');
        assert.ok(vuelto);
        assert.equal(vuelto.sliceKey, 'nocturna_dominical');
        assert.equal(vuelto.tipoLabel, `${HE_TIPO_CANONICO.HE_NOCTURNA_DOM} — sin compensatorio`);
        assert.equal(vuelto.hours, 1);
        assert.ok(vuelto.startMs != null && vuelto.endMs != null);
        const durH = (vuelto.endMs - vuelto.startMs) / (60 * 60 * 1000);
        assert.ok(Math.abs(durH - 1) < 0.1, `duración vuelto ${durH} != 1`);
        const fields = msRangeToExcelHoraFields(vuelto.startMs, vuelto.endMs);
        assert.notEqual(fields.horaInicial, '14:00');
    });

    it('AUT-307: cruce hábil→festivo 19:00–04:00 no tipifica rn como HE', () => {
        const festivosSet = new Set(['2026-08-07']);
        const dep = { toUtcMsFromDateAndTime, festivosSet };
        const it = {
            tipoNovedad: 'Hora Extra',
            mallaOrigenRef: 'EXPERIAN|nocturnos|2026-08-06|22_06|1022339254',
            fechaInicio: '2026-08-06',
            fechaFin: '2026-08-07',
            horaInicio: '19:00',
            horaFin: '04:00',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 4,
            horasRecargoDomingo: 4,
            horasRecargoNocturno: 5,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const rn = slices.filter((s) => s.columnKey === 'horasRecargoNocturno');
        const fest = slices.find((s) => s.sliceKey === 'recargo_nocturno');
        assert.equal(rn.length, 1);
        assert.equal(rn[0].sliceKey, 'recargo_nocturno_ordinario');
        assert.equal(rn[0].tipoLabel, HE_TIPO_CANONICO.REC_NOCTURNO);
        assert.equal(rn[0].hours, 5);
        assert.ok(fest);
        assert.equal(fest.hours, 4);
        assert.equal(fest.tipoLabel, `${HE_TIPO_CANONICO.REC_DOM_NOCTURNO} — sin compensatorio`);
        const rHabil = msRangeToExcelHoraFields(rn[0].startMs, rn[0].endMs);
        const rFest = msRangeToExcelHoraFields(fest.startMs, fest.endMs);
        assert.equal(rHabil.fechaInicio, '2026-08-06');
        assert.equal(rHabil.horaInicial, '19:00');
        assert.equal(rFest.fechaInicio, '2026-08-07');
        assert.notEqual(`${rHabil.horaInicial}-${rHabil.horaFinal}`, `${rFest.horaInicial}-${rFest.horaFinal}`);
        assert.equal(rn[0].hours + fest.hours, 9);
    });

    it('AUT-307: cruce hábil→festivo 22:00–06:00 (2+6) es recargo + recargo', () => {
        const festivosSet = new Set(['2026-08-07']);
        const dep = { toUtcMsFromDateAndTime, festivosSet };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-08-06',
            fechaFin: '2026-08-07',
            horaInicio: '22:00',
            horaFin: '06:00',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 6,
            horasRecargoDomingo: 6,
            horasRecargoNocturno: 2,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const rn = slices.find((s) => s.columnKey === 'horasRecargoNocturno');
        const heDom = slices.find((s) => s.sliceKey === 'nocturna_dominical');
        assert.ok(rn);
        assert.equal(rn.sliceKey, 'recargo_nocturno_ordinario');
        assert.equal(rn.hours, 2);
        assert.equal(heDom, undefined);
        const rHabil = msRangeToExcelHoraFields(rn.startMs, rn.endMs);
        assert.equal(rHabil.fechaInicio, '2026-08-06');
        assert.equal(rHabil.horaInicial, '22:00');
    });

    it('AUT-307: sábado→domingo 22:00–06:00 no inventa HE en el sábado', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-08-08',
            fechaFin: '2026-08-09',
            horaInicio: '22:00',
            horaFin: '06:00',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 6,
            horasRecargoDomingo: 6,
            horasRecargoNocturno: 2,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const rn = slices.find((s) => s.columnKey === 'horasRecargoNocturno');
        const heFromRn = slices.filter(
            (s) => s.columnKey === 'horasRecargoNocturno' && s.sliceKey === 'nocturna_dominical'
        );
        assert.equal(rn.sliceKey, 'recargo_nocturno_ordinario');
        assert.equal(rn.tipoLabel, HE_TIPO_CANONICO.REC_NOCTURNO);
        assert.equal(rn.hours, 2);
        assert.equal(heFromRn.length, 0);
        const fields = msRangeToExcelHoraFields(rn.startMs, rn.endMs);
        assert.equal(fields.fechaInicio, '2026-08-08');
    });

    it('AUT-308: sábado→domingo 22:00–06:00 con rn=8 es recargo + recargo, no HE', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-08-22',
            fechaFin: '2026-08-23',
            horaInicio: '22:00',
            horaFin: '06:00',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            horasRecargoNocturno: 8,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const rnHabil = slices.find((s) => s.sliceKey === 'recargo_nocturno_ordinario');
        const recDom = slices.find((s) => s.sliceKey === 'recargo_nocturno');
        const heDom = slices.find((s) => s.sliceKey === 'nocturna_dominical');
        assert.ok(rnHabil);
        assert.ok(recDom);
        assert.equal(heDom, undefined);
        assert.equal(rnHabil.hours, 2);
        assert.equal(rnHabil.tipoLabel, HE_TIPO_CANONICO.REC_NOCTURNO);
        assert.equal(recDom.hours, 6);
        assert.equal(recDom.tipoLabel, `${HE_TIPO_CANONICO.REC_DOM_NOCTURNO} — sin compensatorio`);
        const rHabil = msRangeToExcelHoraFields(rnHabil.startMs, rnHabil.endMs);
        const rDom = msRangeToExcelHoraFields(recDom.startMs, recDom.endMs);
        assert.equal(rHabil.fechaInicio, '2026-08-22');
        assert.equal(rHabil.horaInicial, '22:00');
        assert.equal(rDom.fechaInicio, '2026-08-23');
        assert.equal(rDom.horaInicial, '00:00');
    });

    it('AUT-308: domingo 8 h con tope lleno deja el vuelto como HE', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-08-23',
            fechaFin: '2026-08-23',
            horaInicio: '14:00',
            horaFin: '22:00',
            horasDiurnas: 0,
            horasNocturnas: 0,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 7,
            horasRecargoDomingo: 7,
            horasRecargoNocturno: 1,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const vuelto = slices.find((s) => s.columnKey === 'horasRecargoNocturno');
        assert.ok(vuelto);
        assert.equal(vuelto.sliceKey, 'nocturna_dominical');
        assert.equal(vuelto.hours, 1);
        assert.equal(vuelto.tipoLabel, `${HE_TIPO_CANONICO.HE_NOCTURNA_DOM} — sin compensatorio`);
    });

    it('AUT-592: vuelto domingo en fila sin recargo → HE Nocturna Dominical', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-07-05',
            fechaFin: '2026-07-05',
            horaInicio: '20:45',
            horaFin: '21:47',
            horasDiurnas: 0,
            horasNocturnas: 1.03,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            horasRecargoNocturno: 0,
            heDomingoObservacion: '[HE_DOMINGO_COMP] modo=dinero; trabajado=2026-07-05'
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const nocDom = slices.find((s) => s.sliceKey === 'nocturna_dominical');
        const nocLab = slices.find((s) => s.sliceKey === 'nocturna_laboral');
        assert.ok(nocDom, 'debe ser extra nocturna dominical');
        assert.equal(nocLab, undefined);
        assert.equal(nocDom.hours, 1.03);
        assert.equal(nocDom.tipoLabel, `${HE_TIPO_CANONICO.HE_NOCTURNA_DOM} — sin compensatorio`);
        assert.ok(nocDom.startMs != null && nocDom.endMs != null);
        const fields = msRangeToExcelHoraFields(nocDom.startMs, nocDom.endMs);
        assert.equal(fields.horaInicial, '20:45');
        assert.equal(fields.horaFinal, '21:46');
    });

    it('AUT-592: extra nocturna de martes sigue hábil', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-07-07',
            fechaFin: '2026-07-07',
            horaInicio: '20:45',
            horaFin: '21:47',
            horasDiurnas: 0,
            horasNocturnas: 1.03,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            horasRecargoNocturno: 0,
            heDomingoObservacion: ''
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const nocLab = slices.find((s) => s.sliceKey === 'nocturna_laboral');
        const nocDom = slices.find((s) => s.sliceKey === 'nocturna_dominical');
        assert.ok(nocLab);
        assert.equal(nocDom, undefined);
        assert.equal(nocLab.tipoLabel, HE_TIPO_CANONICO.HE_NOCTURNA);
        assert.equal(nocLab.hours, 1.03);
    });

    it('AUT-592: cruce 22:59→07:15 con tope lleno parte domingo dominical y lunes hábil', () => {
        const dep = { toUtcMsFromDateAndTime, festivosSet: new Set() };
        const it = {
            tipoNovedad: 'Hora Extra',
            fechaInicio: '2026-07-05',
            fechaFin: '2026-07-06',
            horaInicio: '22:59',
            horaFin: '07:15',
            horasDiurnas: 1.25,
            horasNocturnas: 7.02,
            horasRecargoDomingoDiurnas: 0,
            horasRecargoDomingoNocturnas: 0,
            horasRecargoDomingo: 0,
            horasRecargoNocturno: 0,
            heDomingoObservacion: '[HE_DOMINGO_COMP] modo=dinero; trabajado=2026-07-05'
        };
        const slices = buildHoraExtraExportSlices(it, dep);
        const nocDom = slices.find((s) => s.sliceKey === 'nocturna_dominical');
        const nocLab = slices.find((s) => s.sliceKey === 'nocturna_laboral');
        const diLab = slices.find((s) => s.sliceKey === 'diurna_laboral');
        const diDom = slices.find((s) => s.sliceKey === 'diurna_dominical');
        assert.ok(nocDom, 'cola del domingo = extra nocturna dominical');
        assert.ok(nocLab, 'lunes madrugada = extra nocturna hábil');
        assert.ok(diLab, 'lunes mañana = extra diurna hábil');
        assert.equal(diDom, undefined);
        assert.ok(Math.abs(nocDom.hours + nocLab.hours - 7.02) < 0.05);
        assert.equal(diLab.hours, 1.25);
        assert.equal(nocDom.tipoLabel, `${HE_TIPO_CANONICO.HE_NOCTURNA_DOM} — sin compensatorio`);
        assert.equal(nocLab.tipoLabel, HE_TIPO_CANONICO.HE_NOCTURNA);
        const rDom = msRangeToExcelHoraFields(nocDom.startMs, nocDom.endMs);
        assert.equal(rDom.fechaInicio, '2026-07-05');
        assert.equal(rDom.horaInicial, '22:59');
    });
});
