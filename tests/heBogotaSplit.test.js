'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    computeHoraExtraSplitBogota,
    collectHeDiurnaNocturnaSegmentsBogota,
    collectRecargoDomingoDiurnaNocturnaSegmentsBogota,
    formatHeSegmentListBogota,
    RECARGO_DOMINGO_MAX_HORAS
} = require('../src/heBogotaSplit');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');

test('computeHoraExtraSplitBogota: domingo corto va todo a recargo (diurno)', () => {
    const start = toUtcMsFromDateAndTime('2025-04-06', '12:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-06', '14:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.equal(s.total, 2);
    assert.equal(s.horasRecargoDomingo, 2);
    assert.equal(s.horasRecargoDomingoDiurnas, 2);
    assert.equal(s.horasRecargoDomingoNocturnas, 0);
    assert.equal(s.diurnas, 0);
    assert.equal(s.nocturnas, 0);
});

test('computeHoraExtraSplitBogota: exceso domingo (civil Bogotá) recargo diurno+nocturno mínimo + HE nocturna', () => {
    const start = toUtcMsFromDateAndTime('2025-04-06', '12:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-07', '01:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.ok(Math.abs(s.horasRecargoDomingo - RECARGO_DOMINGO_MAX_HORAS) < 0.02);
    assert.ok(Math.abs(s.horasRecargoDomingoDiurnas - 7) < 0.05);
    assert.ok(Math.abs(s.horasRecargoDomingoNocturnas - 0.33) < 0.05);
    assert.ok(s.nocturnas > 5.4);
    assert.ok(s.diurnas < 0.5);
    assert.ok(Math.abs(s.total - 13) < 0.05);
});

test('computeHoraExtraSplitBogota: lunes laboral sin recargo', () => {
    const start = toUtcMsFromDateAndTime('2025-04-07', '12:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-07', '17:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.equal(s.horasRecargoDomingo, 0);
    assert.equal(s.horasRecargoDomingoDiurnas, 0);
    assert.equal(s.horasRecargoDomingoNocturnas, 0);
    assert.equal(s.diurnas, 5);
    assert.equal(s.nocturnas, 0);
    assert.equal(s.total, 5);
});

test('collectHeDiurnaNocturnaSegmentsBogota: segmentos sin tramos recargo mezclados', () => {
    const start = toUtcMsFromDateAndTime('2025-04-07', '12:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-07', '17:00:00');
    const { diurna, nocturna } = collectHeDiurnaNocturnaSegmentsBogota(start, end);
    assert.equal(diurna.length, 1);
    assert.equal(nocturna.length, 0);
    const label = formatHeSegmentListBogota(diurna);
    assert.ok(label.includes('12:00'), label);
    assert.ok(label.includes('16:59'), label);
});

test('formatHeSegmentListBogota: tramo diurno que termina en frontera 19:00 Bogotá no muestra 19:00 como fin', () => {
    const start = toUtcMsFromDateAndTime('2025-04-07', '07:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-07', '19:00:00');
    const { diurna, nocturna } = collectHeDiurnaNocturnaSegmentsBogota(start, end);
    assert.equal(diurna.length, 1);
    assert.equal(nocturna.length, 0);
    const label = formatHeSegmentListBogota(diurna);
    assert.ok(label.includes('18:59'), label);
    assert.ok(!label.includes('19:00'), label);
});

test('computeHoraExtraSplitBogota: domingo 11:00–22:00 civil Bogotá, recargo todo diurno; exceso HE diurno+nocturno', () => {
    const start = toUtcMsFromDateAndTime('2025-04-06', '11:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-06', '22:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.ok(Math.abs(s.horasRecargoDomingo - RECARGO_DOMINGO_MAX_HORAS) < 0.02);
    assert.ok(Math.abs(s.horasRecargoDomingoDiurnas - RECARGO_DOMINGO_MAX_HORAS) < 0.02);
    assert.ok(s.horasRecargoDomingoNocturnas < 0.05);
    assert.ok(s.nocturnas >= 2.9, `nocturnas=${s.nocturnas}`);
    assert.ok(s.diurnas > 0.5 && s.diurnas < 1, `diurnas=${s.diurnas}`);
    assert.ok(Math.abs(s.total - 11) < 0.05);
});

test('computeHoraExtraSplitBogota: rango con dos domingos calendario Bogotá aplica tope 7,33h por domingo', () => {
    const start = toUtcMsFromDateAndTime('2025-04-06', '12:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-13', '20:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.ok(Math.abs(s.horasRecargoDomingo - 14.66) < 0.02);
    assert.ok(Math.abs(s.horasRecargoDomingoDiurnas - 8.33) < 0.05);
    assert.ok(Math.abs(s.horasRecargoDomingoNocturnas - 6.33) < 0.05);
    assert.ok(Math.abs(s.total - 176) < 0.05);
});

test('collectRecargoDomingoDiurnaNocturnaSegmentsBogota: solo tramo recargo dominical', () => {
    const start = toUtcMsFromDateAndTime('2025-04-06', '11:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-06', '22:00:00');
    const { diurna, nocturna } = collectRecargoDomingoDiurnaNocturnaSegmentsBogota(start, end);
    assert.ok(diurna.length >= 1);
    assert.equal(nocturna.length, 0);
});

test('computeHoraExtraSplitBogota: cruce medianoche en día laboral sin domingo', () => {
    const start = toUtcMsFromDateAndTime('2025-04-08', '22:00:00');
    const end = toUtcMsFromDateAndTime('2025-04-09', '02:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.equal(s.horasRecargoDomingo, 0);
    assert.equal(s.horasRecargoDomingoDiurnas, 0);
    assert.equal(s.horasRecargoDomingoNocturnas, 0);
    assert.ok(Math.abs(s.total - 4) < 0.05);
    assert.ok(s.nocturnas > 0);
    assert.ok(s.diurnas >= 0);
});

test('computeHoraExtraSplitBogota: festivo no-domingo con festivosSet manda HE a recargo diurno', () => {
    /* Lunes 18/05/2026 — festivo Día de la Ascensión (no es domingo) */
    const start = toUtcMsFromDateAndTime('2026-05-18', '08:00:00');
    const end = toUtcMsFromDateAndTime('2026-05-18', '12:00:00');
    const festivosSet = new Set(['2026-05-18']);
    const s = computeHoraExtraSplitBogota(start, end, festivosSet);
    assert.equal(s.horasRecargoDomingo, 4);
    assert.equal(s.horasRecargoDomingoDiurnas, 4);
    assert.equal(s.horasRecargoDomingoNocturnas, 0);
    assert.equal(s.diurnas, 0);
    assert.equal(s.nocturnas, 0);
    assert.equal(s.total, 4);
});

test('computeHoraExtraSplitBogota: festivo no-domingo respeta tope RECARGO_DOMINGO_MAX_HORAS', () => {
    /* Lunes 18/05/2026 festivo, jornada larga 06:00–22:00 (16h): primeras 7,33h al recargo, resto a HE */
    const start = toUtcMsFromDateAndTime('2026-05-18', '06:00:00');
    const end = toUtcMsFromDateAndTime('2026-05-18', '22:00:00');
    const festivosSet = new Set(['2026-05-18']);
    const s = computeHoraExtraSplitBogota(start, end, festivosSet);
    assert.ok(Math.abs(s.horasRecargoDomingo - RECARGO_DOMINGO_MAX_HORAS) < 0.02, `recargo=${s.horasRecargoDomingo}`);
    assert.ok(s.diurnas + s.nocturnas > 8);
    assert.ok(Math.abs(s.total - 16) < 0.05, `total=${s.total}`);
});

test('computeHoraExtraSplitBogota: back-compat — sin festivosSet, festivo no-domingo va a horas planas', () => {
    /* Mismo lunes festivo pero llamando sin set: comportamiento previo (no recargo) */
    const start = toUtcMsFromDateAndTime('2026-05-18', '08:00:00');
    const end = toUtcMsFromDateAndTime('2026-05-18', '12:00:00');
    const s = computeHoraExtraSplitBogota(start, end);
    assert.equal(s.horasRecargoDomingo, 0);
    assert.equal(s.horasRecargoDomingoDiurnas, 0);
    assert.equal(s.diurnas, 4);
    assert.equal(s.nocturnas, 0);
    assert.equal(s.total, 4);
});

test('computeHoraExtraSplitBogota: festivo no-domingo + domingo en el rango aplica tope a cada uno', () => {
    /* Domingo 17/05/2026 12:00 → lunes festivo 18/05/2026 22:00; 34h totales */
    const start = toUtcMsFromDateAndTime('2026-05-17', '12:00:00');
    const end = toUtcMsFromDateAndTime('2026-05-18', '22:00:00');
    const festivosSet = new Set(['2026-05-18']);
    const s = computeHoraExtraSplitBogota(start, end, festivosSet);
    assert.ok(Math.abs(s.horasRecargoDomingo - 14.66) < 0.05, `recargo=${s.horasRecargoDomingo}`);
    assert.ok(Math.abs(s.total - 34) < 0.05, `total=${s.total}`);
});

test('collectRecargoDomingoDiurnaNocturnaSegmentsBogota: festivo no-domingo produce segmento de recargo', () => {
    const start = toUtcMsFromDateAndTime('2026-05-18', '08:00:00');
    const end = toUtcMsFromDateAndTime('2026-05-18', '12:00:00');
    const festivosSet = new Set(['2026-05-18']);
    const { diurna, nocturna } = collectRecargoDomingoDiurnaNocturnaSegmentsBogota(start, end, festivosSet);
    assert.equal(diurna.length, 1);
    assert.equal(nocturna.length, 0);
});

test('collectRecargoDomingoDiurnaNocturnaSegmentsBogota: festivo no-domingo sin festivosSet no produce recargo', () => {
    const start = toUtcMsFromDateAndTime('2026-05-18', '08:00:00');
    const end = toUtcMsFromDateAndTime('2026-05-18', '12:00:00');
    const { diurna, nocturna } = collectRecargoDomingoDiurnaNocturnaSegmentsBogota(start, end);
    assert.equal(diurna.length, 0);
    assert.equal(nocturna.length, 0);
});
