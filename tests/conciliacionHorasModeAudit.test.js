/**
 * Auditoría: modo HOURS + baseHours → valorHora en novedades calculadas por días/horas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeNovedadImpactoMonto } = require('../src/conciliaciones/conciliacionNovedadImpacto');

const TARIFA = 17_291_052;
const OPTS = { billingMode: 'HOURS', baseHours: 160 };
const VH = 108_069;

const CASOS = [
    {
        tipo: 'Incapacidad',
        row: { tipo_novedad: 'Incapacidad', fecha_inicio: '2026-05-02', fecha_fin: '2026-05-04', cantidad_horas: 3 },
        expect: { medida: 'days', valorHora: VH, montoCalculado: true, montoMin: 1 }
    },
    {
        tipo: 'Licencia de paternidad',
        row: { tipo_novedad: 'Licencia de paternidad', fecha_inicio: '2026-05-16', fecha_fin: '2026-05-20', cantidad_horas: 5 },
        expect: { medida: 'days', valorHora: VH, montoCalculado: true, montoMin: 1 }
    },
    {
        tipo: 'Licencia de luto',
        row: { tipo_novedad: 'Licencia de luto', fecha_inicio: '2026-05-14', fecha_fin: '2026-05-15', cantidad_horas: 2 },
        expect: { medida: 'days', valorHora: VH, montoCalculado: true, montoMin: 1 }
    },
    {
        tipo: 'Vacaciones en tiempo',
        row: { tipo_novedad: 'Vacaciones en tiempo', fecha_inicio: '2026-05-18', fecha_fin: '2026-05-20', cantidad_horas: 3 },
        expect: { medida: 'days', valorHora: VH, montoCalculado: true, montoMin: 1 }
    },
    {
        tipo: 'Permiso remunerado 4h',
        row: {
            tipo_novedad: 'Permiso remunerado',
            cantidad_horas: 4,
            unidad: 'horas',
            hora_inicio: '09:00',
            hora_fin: '13:00'
        },
        expect: { medida: 'hours', valorHora: VH, montoCalculado: true, monto: 432_276 }
    },
    {
        tipo: 'Hora Extra',
        row: {
            tipo_novedad: 'Hora Extra',
            cantidad_horas: 3,
            hora_inicio: '10:00',
            hora_fin: '13:00',
            monto_cop: 520_000,
            unidad: 'horas'
        },
        expect: { medida: 'hours', valorHora: VH, montoCalculado: true, monto: 324_207, impacto: 'suma' }
    },
    {
        tipo: 'Bonos',
        row: { tipo_novedad: 'Bonos', monto_cop: 99_000 },
        expect: { medida: 'money', valorHora: null, montoCalculado: false, monto: 99_000 }
    },
    {
        tipo: 'Disponibilidad',
        row: { tipo_novedad: 'Disponibilidad', monto_cop: 185_000 },
        expect: { medida: 'money', valorHora: null, montoCalculado: false, monto: 185_000 }
    }
];

for (const caso of CASOS) {
    test(`HOURS ${caso.tipo}`, () => {
        const r = computeNovedadImpactoMonto(TARIFA, caso.row, OPTS);
        if (caso.expect.medida) assert.equal(r.medida, caso.expect.medida, `medida ${caso.tipo}`);
        if (caso.expect.valorHora != null) assert.equal(r.valorHora, caso.expect.valorHora);
        if (caso.expect.valorHora === null) assert.equal(r.valorHora ?? null, null);
        assert.equal(r.montoCalculado, caso.expect.montoCalculado);
        if (caso.expect.monto != null) assert.equal(r.montoCop, caso.expect.monto);
        if (caso.expect.montoMin != null) assert.ok(r.montoCop >= caso.expect.montoMin);
        if (caso.expect.impacto) assert.equal(r.impacto, caso.expect.impacto);
    });
}
