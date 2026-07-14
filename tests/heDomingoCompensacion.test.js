'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    getVentanaCompensatorioTiempo,
    isYmdEnVentanaCompensatorio,
    buildHeDomingoCompObservacionLine,
    parseHeDomingoCompFromObservacion,
    formatHeDomingoCompTipoSuffix,
    formatHeDomingoCompGestionResumen,
    buildSyntheticHoraExtraRow,
    computeHeDomingoCompensacionPreview,
    buildConsultantKeyDefault
} = require('../src/heDomingoCompensacion');
const { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow } = require('../src/novedadHeTime');

describe('heDomingoCompensacion', () => {
    it('ventana compensatorio en tiempo: D+1 a D+6 lun-sab semana siguiente', () => {
        const worked = '2026-04-05';
        const vent = getVentanaCompensatorioTiempo(worked);
        assert.equal(vent.compensatorioTiempoMinYmd, '2026-04-06');
        assert.equal(vent.compensatorioTiempoMaxYmd, '2026-04-11');
    });

    it('acepta cualquier día dentro de la ventana lun-sab', () => {
        const worked = '2026-04-05';
        assert.equal(isYmdEnVentanaCompensatorio(worked, '2026-04-07'), true);
        assert.equal(isYmdEnVentanaCompensatorio(worked, '2026-04-06'), true);
        assert.equal(isYmdEnVentanaCompensatorio(worked, '2026-04-11'), true);
        assert.equal(isYmdEnVentanaCompensatorio(worked, '2026-04-05'), false);
        assert.equal(isYmdEnVentanaCompensatorio(worked, '2026-04-12'), false);
    });

    it('parsea línea persistida y sufijo Excel', () => {
        const line = buildHeDomingoCompObservacionLine({
            mode: 'tiempo',
            workedYmd: '2026-04-05',
            compensatorioYmd: '2026-04-07'
        });
        assert.ok(line.includes('[HE_DOMINGO_COMP]'));
        const p = parseHeDomingoCompFromObservacion(`Policy text\n${line}`);
        assert.equal(p.mode, 'tiempo');
        assert.equal(p.workedYmd, '2026-04-05');
        assert.equal(p.compensatorioYmd, '2026-04-07');
        assert.ok(formatHeDomingoCompTipoSuffix(line).includes('tiempo'));
    });

    it('resumen gestión usa «día compensatorio» en modo tiempo', () => {
        const line = buildHeDomingoCompObservacionLine({
            mode: 'tiempo',
            workedYmd: '2026-04-05',
            compensatorioYmd: '2026-04-13'
        });
        const r = formatHeDomingoCompGestionResumen(line);
        assert.ok(r.includes('día compensatorio'));
        assert.ok(!r.toLowerCase().includes('domingo compensatorio'));
    });

    it('preview tier 2 con segundo domingo distinto en el mes', () => {
        const dep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
        const row1 = buildSyntheticHoraExtraRow({
            nombre: 'Ana',
            cedula: '1',
            fechaInicio: '2026-04-05',
            fechaFin: '2026-04-05',
            horaInicio: '10:00:00',
            horaFin: '12:00:00'
        });
        const draft = buildSyntheticHoraExtraRow({
            nombre: 'Ana',
            cedula: '1',
            fechaInicio: '2026-04-12',
            fechaFin: '2026-04-12',
            horaInicio: '10:00:00',
            horaFin: '12:00:00'
        });
        const prev = computeHeDomingoCompensacionPreview([row1], draft, dep, buildConsultantKeyDefault);
        assert.equal(prev.maxTier, 2);
        assert.equal(prev.requiereEleccionCompensacion, true);
        assert.equal(prev.esTercerDomingoOMas, false);
        assert.equal(prev.domingoTrabajadoYmd, '2026-04-12');
        assert.equal(prev.compensatorioTiempoMinYmd, '2026-04-13');
        assert.equal(prev.compensatorioTiempoMaxYmd, '2026-04-18');
        assert.equal(isYmdEnVentanaCompensatorio(prev.domingoTrabajadoYmd, '2026-04-14'), true);
    });

    it('preview tier 1: primer domingo del mes sin HE previa pide elección y ventana', () => {
        const dep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
        const draft = buildSyntheticHoraExtraRow({
            nombre: 'Ana',
            cedula: '1',
            fechaInicio: '2026-04-05',
            fechaFin: '2026-04-05',
            horaInicio: '10:00:00',
            horaFin: '12:00:00'
        });
        const prev = computeHeDomingoCompensacionPreview([], draft, dep, buildConsultantKeyDefault);
        assert.equal(prev.maxTier, 1);
        assert.equal(prev.requiereEleccionCompensacion, true);
        assert.equal(prev.esTercerDomingoOMas, false);
        assert.equal(prev.domingoTrabajadoYmd, '2026-04-05');
        assert.equal(prev.compensatorioTiempoMinYmd, '2026-04-06');
        assert.equal(prev.compensatorioTiempoMaxYmd, '2026-04-11');
    });

    it('festivo no-domingo NO dispara compensatorio aunque festivosSet esté en dep', () => {
        /* Lunes 18/05/2026 — festivo Día de la Ascensión */
        const dep = {
            toUtcMsFromDateAndTime,
            resolveFallbackDateKeyFromRow,
            festivosSet: new Set(['2026-05-18'])
        };
        const draft = buildSyntheticHoraExtraRow({
            nombre: 'Ana',
            cedula: '1',
            fechaInicio: '2026-05-18',
            fechaFin: '2026-05-18',
            horaInicio: '08:00:00',
            horaFin: '10:00:00'
        });
        const prev = computeHeDomingoCompensacionPreview([], draft, dep, buildConsultantKeyDefault);
        assert.equal(prev.maxTier, 0);
        assert.equal(prev.requiereEleccionCompensacion, false);
        assert.equal(prev.esTercerDomingoOMas, false);
        assert.equal(prev.domingoTrabajadoYmd, null);
        assert.equal(prev.compensatorioTiempoMinYmd, null);
    });

    it('festivo previo no incrementa tier de un domingo posterior', () => {
        /* Festivo lunes 18/05/2026 + draft domingo 24/05/2026 → debe quedar como tier 1, no tier 2 */
        const dep = {
            toUtcMsFromDateAndTime,
            resolveFallbackDateKeyFromRow,
            festivosSet: new Set(['2026-05-18'])
        };
        const festivoPrevio = buildSyntheticHoraExtraRow({
            nombre: 'Ana',
            cedula: '1',
            fechaInicio: '2026-05-18',
            fechaFin: '2026-05-18',
            horaInicio: '08:00:00',
            horaFin: '10:00:00'
        });
        const draftDomingo = buildSyntheticHoraExtraRow({
            nombre: 'Ana',
            cedula: '1',
            fechaInicio: '2026-05-24',
            fechaFin: '2026-05-24',
            horaInicio: '10:00:00',
            horaFin: '12:00:00'
        });
        const prev = computeHeDomingoCompensacionPreview([festivoPrevio], draftDomingo, dep, buildConsultantKeyDefault);
        assert.equal(prev.maxTier, 1);
        assert.equal(prev.requiereEleccionCompensacion, true);
        assert.equal(prev.domingoTrabajadoYmd, '2026-05-24');
    });
});
