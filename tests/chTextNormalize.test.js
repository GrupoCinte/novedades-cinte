const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChListText, normalizeColabTextPatch } = require('../src/onboarding/chTextNormalize');

describe('chTextNormalize', () => {
    it('normalizeChListText trim + uppercase', () => {
        assert.equal(normalizeChListText('  ana maría  '), 'ANA MARÍA');
        assert.equal(normalizeChListText(''), '');
    });

    it('normalizeColabTextPatch solo campos CH', () => {
        const out = normalizeColabTextPatch({
            nombre: 'juan pérez',
            cliente: 'acme',
            puesto: 'dev',
            descriptivo_puesto_sig: 'consultor sr',
            correo_cinte: 'x@grupocinte.com'
        });
        assert.equal(out.nombre, 'JUAN PÉREZ');
        assert.equal(out.cliente, 'ACME');
        assert.equal(out.puesto, 'DEV');
        assert.equal(out.descriptivo_puesto_sig, 'CONSULTOR SR');
        assert.equal(out.correo_cinte, 'x@grupocinte.com');
    });
});
