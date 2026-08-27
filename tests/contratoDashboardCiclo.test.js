const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cicloFichaIngresoDias, fichaNacioDate, promedio } = require('../src/onboarding/contratoDashboardCiclo');

describe('AUT-320 ciclo ficha → ingreso', () => {
    it('prioriza reclutamiento, luego buzón, luego alta', () => {
        assert.equal(
            fichaNacioDate({
                fechaReclutamiento: '2026-07-01',
                stagingCreated: '2026-07-10',
                personaCreated: '2026-07-20'
            }),
            '2026-07-01'
        );
        assert.equal(
            fichaNacioDate({ stagingCreated: '2026-07-10T15:00:00Z', personaCreated: '2026-07-20' }),
            '2026-07-10'
        );
        assert.equal(fichaNacioDate({ personaCreated: '2026-07-20T08:00:00-05:00' }), '2026-07-20');
    });

    it('cuenta días desde la ficha hasta el ingreso', () => {
        assert.equal(
            cicloFichaIngresoDias({
                fechaIngreso: '2026-08-20',
                fechaReclutamiento: '2026-08-01'
            }),
            19
        );
    });

    it('ignora ingreso anterior al nacimiento de la ficha', () => {
        assert.equal(
            cicloFichaIngresoDias({
                fechaIngreso: '2026-07-01',
                fechaReclutamiento: '2026-08-01'
            }),
            null
        );
    });

    it('promedia solo valores válidos', () => {
        assert.equal(promedio([10, 20, 30]), 20);
        assert.equal(promedio([]), null);
    });
});
