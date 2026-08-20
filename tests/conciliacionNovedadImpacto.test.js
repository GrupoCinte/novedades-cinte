const test = require('node:test');
const assert = require('node:assert/strict');
const {
    computeNovedadImpactoMonto,
    aggregateNovedadesImpacto,
    getNovedadImpactoFacturacion
} = require('../src/conciliaciones/conciliacionNovedadImpacto');

test('permiso remunerado en junio usa tarifa/días_del_mes × 3', () => {
    const r = computeNovedadImpactoMonto(
        3_000_000,
        {
            tipo_novedad: 'Permiso remunerado',
            cantidad_horas: 3,
            unidad: 'dias',
            fecha_inicio: '2026-06-06',
            fecha_fin: '2026-06-08',
            monto_cop: 999999
        },
        { factAnio: 2026, factMes: 6 }
    );
    assert.equal(r.montoCop, 300_000);
});

test('permiso remunerado 4 horas resta tarifa/176 × 4', () => {
    const r = computeNovedadImpactoMonto(3_520_000, {
        tipo_novedad: 'Permiso remunerado',
        cantidad_horas: 4,
        unidad: 'horas',
        hora_inicio: '09:00',
        hora_fin: '13:00',
        monto_cop: null
    });
    assert.equal(r.impacto, 'resta');
    assert.equal(r.medida, 'hours');
    assert.equal(r.cantidad, 4);
    assert.equal(r.montoCop, 80_000);
});

test('permiso remunerado 4 horas usa baseHours del servicio en modo HOURS', () => {
    const r = computeNovedadImpactoMonto(
        3_520_000,
        {
            tipo_novedad: 'Permiso remunerado',
            cantidad_horas: 4,
            unidad: 'horas',
            hora_inicio: '09:00',
            hora_fin: '13:00',
            monto_cop: null
        },
        { billingMode: 'HOURS', baseHours: 160 }
    );
    assert.equal(r.montoCop, 88_000);
    assert.equal(r.valorHora, 22_000);
    assert.equal(r.horasBaseMes, 160);
});

test('sin options en modo CALENDAR_DAYS sigue usando 176 para horas', () => {
    const r = computeNovedadImpactoMonto(
        3_520_000,
        {
            tipo_novedad: 'Permiso remunerado',
            cantidad_horas: 4,
            unidad: 'horas'
        },
        { billingMode: 'CALENDAR_DAYS', baseHours: 160 }
    );
    assert.equal(r.montoCop, 80_000);
});

test('bono suma monto_cop explícito', () => {
    const r = computeNovedadImpactoMonto(3_000_000, {
        tipo_novedad: 'Bonos',
        monto_cop: 450_000
    });
    assert.equal(r.impacto, 'suma');
    assert.equal(r.montoCop, 450_000);
    assert.equal(r.montoCalculado, false);
});

test('vacaciones en dinero ignora monto_cop y usa días × tarifa/30', () => {
    const r = computeNovedadImpactoMonto(3_000_000, {
        tipo_novedad: 'Vacaciones en dinero',
        cantidad_horas: 2,
        monto_cop: 890_000
    });
    assert.equal(r.impacto, 'resta');
    assert.equal(r.medida, 'days');
    assert.equal(r.cantidad, 2);
    assert.equal(r.montoCop, 200_000);
});

test('suspensión resta días calendario del rango', () => {
    const r = computeNovedadImpactoMonto(3_000_000, {
        tipo_novedad: 'Suspensión',
        fecha_inicio: '2026-05-01',
        fecha_fin: '2026-05-05',
        monto_cop: null
    });
    assert.equal(r.impacto, 'resta');
    assert.equal(r.medida, 'days');
    assert.equal(r.cantidad, 5);
    assert.equal(r.montoCop, 500_000);
});

test('incapacidad en conciliaciones cuenta solo días hábiles (sin fin de semana)', () => {
    const r = computeNovedadImpactoMonto(3_000_000, {
        tipo_novedad: 'Incapacidad',
        fecha_inicio: '2026-05-09',
        fecha_fin: '2026-05-10',
        cantidad_horas: 0,
        monto_cop: 100
    });
    assert.equal(r.medida, 'days');
    assert.equal(r.cantidad, 0);
    assert.equal(r.montoCop, 0);
});

test('incapacidad un día hábil resta tarifa/días_del_mes × 1', () => {
    const r = computeNovedadImpactoMonto(
        3_000_000,
        {
            tipo_novedad: 'Incapacidad',
            fecha_inicio: '2026-05-15',
            fecha_fin: '2026-05-15',
            cantidad_horas: 0,
            monto_cop: 100
        },
        { factAnio: 2026, factMes: 5 }
    );
    assert.equal(r.medida, 'days');
    assert.equal(r.cantidad, 1);
    assert.equal(r.montoCop, Math.round(3_000_000 / 31));
});

test('aggregateNovedadesImpacto combina suma y resta', () => {
    const agg = aggregateNovedadesImpacto(5_000_000, [
        { tipo_novedad: 'Bonos', monto_cop: 100_000 },
        { tipo_novedad: 'Permiso remunerado', cantidad_horas: 1, unidad: 'dias', fecha_inicio: '2026-05-01', fecha_fin: '2026-05-01' }
    ]);
    assert.equal(agg.sumSuma, 100_000);
    assert.equal(agg.sumResta, Math.round(5_000_000 / 30));
    assert.equal(agg.facturaCop, 5_000_000 + 100_000 - Math.round(5_000_000 / 30));
    assert.equal(agg.count, 2);
});

test('incapacidad en modo HOURS usa días hábiles × h/día laboral del servicio', () => {
    const tarifa = 17_291_052;
    const r = computeNovedadImpactoMonto(
        tarifa,
        {
            tipo_novedad: 'Incapacidad',
            fecha_inicio: '2026-05-02',
            fecha_fin: '2026-05-04',
            monto_cop: 100
        },
        { billingMode: 'HOURS', baseHours: 160 }
    );
    assert.equal(r.medida, 'days');
    assert.equal(r.cantidad, 1, 'solo lunes 4-may es hábil en el rango');
    assert.equal(r.cantidadHoras, 8);
    assert.equal(r.valorHora, 108_069);
    assert.equal(r.horasBaseMes, 160);
    assert.equal(r.montoCop, Math.round((tarifa / 160) * 8));
});

test('getNovedadImpactoFacturacion clasifica hora extra como suma', () => {
    assert.equal(getNovedadImpactoFacturacion('Hora Extra'), 'suma');
    assert.equal(getNovedadImpactoFacturacion('Incapacidad'), 'resta');
});

test('HE en modo CALENDAR_DAYS: tarifa ÷ horas laborables del mes × horas (sin monto_cop)', () => {
    const tarifa = 5_513_847;
    const r = computeNovedadImpactoMonto(
        tarifa,
        {
            tipo_novedad: 'Hora Extra',
            cantidad_horas: 180,
            monto_cop: null
        },
        { billingMode: 'CALENDAR_DAYS', factAnio: 2026, factMes: 7 }
    );
    const horasMes = 193.2;
    assert.equal(r.impacto, 'suma');
    assert.equal(r.medida, 'hours');
    assert.equal(r.cantidad, 180);
    assert.equal(r.horasBaseMes, horasMes);
    assert.equal(r.montoCalculado, true);
    assert.ok(r.montoCop > 0);
    assert.equal(r.montoCop, Math.round((tarifa / horasMes) * 180));
});

test('HE en modo HOURS no cambia: tarifa ÷ baseHours × horas', () => {
    const tarifa = 5_513_847;
    const r = computeNovedadImpactoMonto(
        tarifa,
        {
            tipo_novedad: 'Hora Extra',
            cantidad_horas: 180,
            monto_cop: null
        },
        { billingMode: 'HOURS', baseHours: 180 }
    );
    assert.equal(r.medida, 'hours');
    assert.equal(r.horasBaseMes, 180);
    assert.equal(r.montoCop, tarifa);
});

test('Disponibilidad en modo mes sigue usando monto_cop', () => {
    const r = computeNovedadImpactoMonto(
        5_000_000,
        {
            tipo_novedad: 'Disponibilidad',
            cantidad_horas: 10,
            monto_cop: 250_000
        },
        { billingMode: 'CALENDAR_DAYS', factAnio: 2026, factMes: 7 }
    );
    assert.equal(r.medida, 'money');
    assert.equal(r.montoCop, 250_000);
    assert.equal(r.montoCalculado, false);
});
