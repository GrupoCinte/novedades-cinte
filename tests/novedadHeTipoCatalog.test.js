'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    HE_TIPO_CANONICO,
    HE_TIPO_CATALOGO_ORDEN,
    resolveHeCompensatorioSuffix,
    formatHeTipoNovedadDisplay,
    formatHeTipoFromSliceKey,
    mapLegacyTipoHoraExtraToCanonical
} = require('../src/novedadHeTipoCatalog');

describe('novedadHeTipoCatalog', () => {
    it('expone las 7 etiquetas canónicas en orden', () => {
        assert.equal(HE_TIPO_CATALOGO_ORDEN.length, 7);
        assert.deepEqual(HE_TIPO_CATALOGO_ORDEN, [
            HE_TIPO_CANONICO.HE_DIURNA,
            HE_TIPO_CANONICO.HE_DIURNA_DOM,
            HE_TIPO_CANONICO.HE_NOCTURNA,
            HE_TIPO_CANONICO.HE_NOCTURNA_DOM,
            HE_TIPO_CANONICO.REC_DOM_DIURNO,
            HE_TIPO_CANONICO.REC_DOM_NOCTURNO,
            HE_TIPO_CANONICO.REC_NOCTURNO
        ]);
    });

    it('modo=tiempo en dominical → con compensatorio', () => {
        const obs = '[HE_DOMINGO_COMP] modo=tiempo; trabajado=2026-04-26; compensatorio=2026-04-29';
        assert.equal(resolveHeCompensatorioSuffix(obs, 'recargo_diurno'), ' — con compensatorio');
        assert.equal(resolveHeCompensatorioSuffix(obs, 'diurna_laboral'), '');
    });

    it('modo=dinero en dominical → sin compensatorio', () => {
        const obs = '[HE_DOMINGO_COMP] modo=dinero; trabajado=2026-04-05';
        assert.equal(
            formatHeTipoFromSliceKey('diurna_dominical', obs),
            `${HE_TIPO_CANONICO.HE_DIURNA_DOM} — sin compensatorio`
        );
    });

    it('mapLegacyTipoHoraExtraToCanonical traduce Diurna/Mixta', () => {
        assert.deepEqual(mapLegacyTipoHoraExtraToCanonical('Diurna'), [HE_TIPO_CANONICO.HE_DIURNA]);
        assert.deepEqual(mapLegacyTipoHoraExtraToCanonical('Mixta'), [
            HE_TIPO_CANONICO.HE_DIURNA,
            HE_TIPO_CANONICO.HE_NOCTURNA
        ]);
    });

    it('formatHeTipoNovedadDisplay laboral sin sufijo', () => {
        assert.equal(
            formatHeTipoNovedadDisplay(HE_TIPO_CANONICO.REC_NOCTURNO, '', 'recargo_nocturno_ordinario'),
            HE_TIPO_CANONICO.REC_NOCTURNO
        );
    });
});
