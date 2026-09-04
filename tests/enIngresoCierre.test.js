const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { annotateEnIngresoCerrado, annotateExecutionAlreadyActivo } = require('../src/onboarding/enIngresoCierre');

describe('enIngresoCierre', () => {
    it('marca alreadyActivo si la cédula está en el maestro activo', () => {
        const marked = annotateExecutionAlreadyActivo(
            { executionId: 'a', cedula: '1010', statusId: 4, realStatus: 'Documentos Recibidos' },
            new Set(['1010'])
        );
        assert.equal(marked.alreadyActivo, true);
        assert.equal(marked.statusId, 6);
    });

    it('deja abierta la ficha si no está en Activos', () => {
        const marked = annotateExecutionAlreadyActivo(
            { executionId: 'b', cedula: '2020', statusId: 4, realStatus: 'Documentos Recibidos' },
            new Set(['1010'])
        );
        assert.equal(marked.alreadyActivo, undefined);
        assert.equal(marked.statusId, 4);
    });

    it('cruza el listado con Postgres', async () => {
        const pool = {
            query: async (_sql, params) => {
                const asked = params[0];
                assert.ok(asked.includes('1010'));
                return { rows: [{ cedula: '1010' }] };
            }
        };
        const out = await annotateEnIngresoCerrado(pool, [
            { executionId: 'a', cedula: '1010', statusId: 3 },
            { executionId: 'b', cedula: '2020', statusId: 3 }
        ]);
        assert.equal(out[0].alreadyActivo, true);
        assert.equal(out[1].alreadyActivo, undefined);
    });
});
