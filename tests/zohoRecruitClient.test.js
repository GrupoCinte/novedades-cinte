'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseSalarioMax, excedeAspiracion } = require('../src/sourcing/services/zohoRecruitClient');

describe('zohoRecruitClient salario', () => {
    it('parseSalarioMax extrae de rangos COP', () => {
        assert.equal(parseSalarioMax({ salario_rangos_cop: ['5000000', '6000000'] }), 5000000);
    });

    it('excedeAspiracion descarta cuando supera max', () => {
        assert.equal(excedeAspiracion('$8.000.000', 5000000), true);
        assert.equal(excedeAspiracion('$4.000.000', 5000000), false);
    });
});
