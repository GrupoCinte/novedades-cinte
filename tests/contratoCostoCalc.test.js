const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    computeContratoEconomia,
    costoEmpresaNomina,
    FACTOR_NOMINA
} = require('../src/onboarding/contratoCostoCalc');

describe('contratoCostoCalc AUT-318', () => {
    it('nómina: costo es sueldo ×1.3936, no solo el 39.36 %', () => {
        assert.equal(costoEmpresaNomina(1_000_000), 1_393_600);
        assert.equal(costoEmpresaNomina(1_000_000), 1_000_000 * FACTOR_NOMINA);
    });

    it('utilidad y rentabilidad salen de tarifa − costo', () => {
        const r = computeContratoEconomia({
            esquema_contrato: 'Nómina',
            tipo_contrato: 'Indefinido',
            sueldo_nomina: 1_000_000,
            tarifa_cliente: 2_000_000
        });
        assert.equal(r.modo, 'nomina');
        assert.equal(r.costo_empresa, 1_393_600);
        assert.equal(r.utilidad, 606_400);
        assert.equal(r.rt_aprox, 0.3032);
    });

    it('OPS no mezcla el factor de nómina', () => {
        const r = computeContratoEconomia({
            esquema_contrato: 'OPS',
            honorarios: 1_000_000,
            sueldo_nomina: 0,
            tarifa_cliente: 2_000_000
        });
        assert.equal(r.modo, 'ops');
        assert.equal(r.costo_empresa, 1_300_200);
        assert.equal(r.utilidad, 699_800);
    });

    it('mergeEconomiaSource pisa solo inputs de la pastilla', () => {
        const { mergeEconomiaSource } = require('../src/onboarding/colaboradorContratos');
        const merged = mergeEconomiaSource(
            { sueldo_nomina: 1_000_000, tarifa_cliente: 2_000_000, esquema_contrato: 'Nómina' },
            { sueldo_nomina: 1_500_000, tipo_contrato: 'Indefinido' }
        );
        assert.equal(merged.sueldo_nomina, 1_500_000);
        assert.equal(merged.tarifa_cliente, 2_000_000);
        assert.equal(merged.tipo_contrato, 'Indefinido');
    });

    it('OPS suma salario integral, aportes, 5.17 % y extras', () => {
        const r = computeContratoEconomia({
            esquema_contrato: 'Prestación de servicios',
            honorarios: 1_000_000,
            sueldo_nomina: 1_000_000,
            costo_licencias_teams_correo: 50_000,
            costo_equipo_computo: 80_000,
            auxilios_no_prestacionales: 20_000,
            otros_ingresos: 10_000,
            tarifa_cliente: 3_000_000
        });
        const salarioIntegral = 700_000;
        const aportes = (1_000_000 + salarioIntegral) * 0.3002;
        const esperado = 1_000_000 + salarioIntegral + aportes + 51_700 + 50_000 + 20_000 + 10_000 + 80_000;
        assert.equal(r.costo_empresa, Math.round(esperado * 100) / 100);
    });
});
