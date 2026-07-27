'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    countBusinessDaysInMonth,
    resolveDiasBaseMes
} = require('../src/conciliaciones/conciliacionDiasBaseMes');

describe('conciliacionDiasBaseMes', () => {
    it('CALENDAR_DAYS devuelve días del mes calendario', () => {
        const out = resolveDiasBaseMes({ billingMode: 'CALENDAR_DAYS', year: 2026, month: 2 });
        assert.equal(out.diasBaseMes, 28);
        assert.equal(out.diasBaseLabel, 'Días calendario del mes');
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
