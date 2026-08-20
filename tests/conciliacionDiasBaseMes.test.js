'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    countBusinessDaysInMonth,
    resolveDiasBaseMes,
    diasComercialMes,
    clipRangoAMesComercial
} = require('../src/conciliaciones/conciliacionDiasBaseMes');

describe('conciliacionDiasBaseMes', () => {
    it('CALENDAR_DAYS usa mes comercial (febrero 28, julio 30)', () => {
        const feb = resolveDiasBaseMes({ billingMode: 'CALENDAR_DAYS', year: 2026, month: 2 });
        assert.equal(feb.diasBaseMes, 28);
        assert.equal(feb.diasBaseLabel, 'Días del mes');
        const jul = resolveDiasBaseMes({ billingMode: 'CALENDAR_DAYS', year: 2026, month: 7 });
        assert.equal(jul.diasBaseMes, 30);
        assert.equal(diasComercialMes(2026, 7), 30);
        assert.equal(diasComercialMes(2026, 4), 30);
    });

    it('clip vacaciones 1-31 jul queda en 1-30', () => {
        const c = clipRangoAMesComercial('2026-07-01', '2026-07-31', 2026, 7);
        assert.deepEqual(c, { start: '2026-07-01', end: '2026-07-30' });
    });

    it('countBusinessDaysInMonth excluye sáb/dom y festivo', () => {
        const festivos = new Set(['2026-05-01']);
        const n = countBusinessDaysInMonth(2026, 5, festivos);
        assert.ok(n > 0);
        assert.ok(n < 31);
    });

    it('BUSINESS_DAYS usa conteo con festivos cuando hay set', () => {
        const festivos = new Set(['2026-06-01']);
        const out = resolveDiasBaseMes({
            billingMode: 'BUSINESS_DAYS',
            year: 2026,
            month: 6,
            festivosSet: festivos
        });
        assert.equal(out.diasBaseLabel, 'Días hábiles del mes');
        assert.equal(out.festivosAplicados, true);
        assert.ok(out.diasBaseMes > 0);
    });

    it('HOURS no devuelve diasBaseMes', () => {
        const out = resolveDiasBaseMes({ billingMode: 'HOURS', year: 2026, month: 6 });
        assert.equal(out.diasBaseMes, null);
    });
});
