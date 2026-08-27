const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('contratosFromFicha AUT-312', () => {
    it('arma una pastilla cabecera vigente desde la ficha', async () => {
        const { contratosFromFicha } = await import('../react-frontend/src/onboarding/contratoEstanteMap.js');
        const list = contratosFromFicha(
            { cliente: 'EXPERIAN', tipo_contrato: 'Fijo', fecha_termino: '2026-11-15' },
            { esBaja: false }
        );
        assert.equal(list.length, 1);
        assert.equal(list[0].id, 'cabecera');
        assert.equal(list[0].esCabecera, true);
        assert.equal(list[0].vigente, true);
        assert.equal(list[0].cliente, 'EXPERIAN');
        assert.equal(list[0].tipo, 'Fijo');
        assert.equal(list[0].fechaTermino, '2026-11-15');
    });

    it('marca histórico si la persona está en baja', async () => {
        const { contratosFromFicha } = await import('../react-frontend/src/onboarding/contratoEstanteMap.js');
        const list = contratosFromFicha({ cliente: 'DAVIVIENDA' }, { esBaja: true });
        assert.equal(list[0].vigente, false);
    });

    it('el extra de vigentes es 0 el día uno (una sola cabecera)', async () => {
        const { contratosVigentesExtra } = await import('../react-frontend/src/onboarding/contratoEstanteMap.js');
        assert.equal(contratosVigentesExtra({ cliente: 'EXPERIAN' }), 0);
    });

    it('usa contratos_vigentes_count de la fila cuando exista (AUT-313)', async () => {
        const { contratosVigentesExtra } = await import('../react-frontend/src/onboarding/contratoEstanteMap.js');
        assert.equal(contratosVigentesExtra({ contratos_vigentes_count: 3 }), 2);
        assert.equal(contratosVigentesExtra({ contratos_vigentes: 1 }), 0);
    });
});
