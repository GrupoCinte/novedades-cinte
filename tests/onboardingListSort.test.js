const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPersonalOrderBy,
    buildLicenciasOrderBy,
    buildExtranjerosOrderBy,
    isAllowedPersonalSort,
    isAllowedLicenciasSort,
    isAllowedExtranjerosSort
} = require('../src/onboarding/onboardingListSort');

describe('onboardingListSort', () => {
    it('personal default ORDER BY fecha_ingreso ASC', () => {
        const sql = buildPersonalOrderBy(undefined, undefined);
        assert.match(sql, /c\.fecha_ingreso ASC NULLS LAST/);
    });

    it('personal sort whitelist mapea nombre', () => {
        const sql = buildPersonalOrderBy('nombre', 'desc');
        assert.match(sql, /c\.nombre DESC NULLS LAST/);
    });

    it('sort legado fecha_baja_efectiva ordena por fecha_termino', () => {
        const sql = buildPersonalOrderBy('fecha_baja_efectiva', 'desc');
        assert.match(sql, /c\.fecha_termino DESC NULLS LAST/);
        assert.doesNotMatch(sql, /fecha_baja_efectiva/);
    });

    it('rechaza sort no whitelisted en personal', () => {
        assert.equal(isAllowedPersonalSort('DROP TABLE'), false);
        assert.equal(isAllowedPersonalSort('nombre'), true);
    });

    it('licencias default inicio_licencia ASC', () => {
        const sql = buildLicenciasOrderBy(undefined, undefined);
        assert.match(sql, /l\.inicio_licencia ASC NULLS LAST/);
    });

    it('extranjeros default fecha_vencimiento ASC', () => {
        const sql = buildExtranjerosOrderBy(undefined, undefined);
        assert.match(sql, /d\.fecha_vencimiento ASC NULLS LAST/);
    });

    it('licencias y extranjeros validan whitelist', () => {
        assert.equal(isAllowedLicenciasSort('inicio_licencia'), true);
        assert.equal(isAllowedLicenciasSort('; DELETE'), false);
        assert.equal(isAllowedExtranjerosSort('fecha_vencimiento'), true);
        assert.equal(isAllowedExtranjerosSort('evil'), false);
    });
});
