const test = require('node:test');
const assert = require('node:assert/strict');
const {
    franjasForVariant,
    franjaToDateTimeRange,
    buildMallaOrigenRef,
    monthRangeYmd,
    addDaysYmd
} = require('../src/mallaTurnoHeExport');
const { computeHoraExtraSplitBogota } = require('../src/heBogotaSplit');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');

test('franjasForVariant separa mallas y nocturnos', () => {
    assert.deepEqual(franjasForVariant('mallas'), ['06_14', '14_22', '22_06']);
    assert.deepEqual(franjasForVariant('nocturnos'), ['22_06']);
});

test('franjaToDateTimeRange mapea 06_14 y 22_06', () => {
    assert.deepEqual(franjaToDateTimeRange('2026-06-10', '06_14'), {
        fechaInicio: '2026-06-10',
        horaInicio: '06:00',
        fechaFin: '2026-06-10',
        horaFin: '14:00'
    });
    assert.deepEqual(franjaToDateTimeRange('2026-06-10', '22_06'), {
        fechaInicio: '2026-06-10',
        horaInicio: '22:00',
        fechaFin: '2026-06-11',
        horaFin: '06:00'
    });
});

test('buildMallaOrigenRef es estable y única por celda', () => {
    const ref = buildMallaOrigenRef('Cliente Demo', 'mallas', '2026-06-10', '14_22', '1234567890');
    assert.equal(ref, 'Cliente Demo|mallas|2026-06-10|14_22|1234567890');
});

test('monthRangeYmd y addDaysYmd', () => {
    assert.deepEqual(monthRangeYmd(2026, 6), { desde: '2026-06-01', hasta: '2026-06-30' });
    assert.equal(addDaysYmd('2026-06-30', 1), '2026-07-01');
});

test('split 06_14 produce 8h diurnas en día hábil', () => {
    const range = franjaToDateTimeRange('2026-06-10', '06_14');
    const startMs = toUtcMsFromDateAndTime(range.fechaInicio, range.horaInicio);
    const endMs = toUtcMsFromDateAndTime(range.fechaFin, range.horaFin);
    const split = computeHoraExtraSplitBogota(startMs, endMs, new Set());
    assert.equal(split.total, 8);
    assert.equal(split.diurnas, 8);
    assert.equal(split.nocturnas, 0);
});

test('aprobarMallaTurnosMes 409 si mes ya aprobado', async () => {
    const { aprobarMallaTurnosMes } = require('../src/mallaTurnoHeExport');
    const dbClient = {
        query: async (sql) => {
            if (/BEGIN/i.test(sql)) return { rows: [] };
            if (/INSERT INTO malla_turno_aprobacion/i.test(sql)) return { rows: [] };
            if (/ROLLBACK/i.test(sql)) return { rows: [] };
            return { rows: [] };
        },
        release: () => {}
    };
    const pool = {
        connect: async () => dbClient
    };
    await assert.rejects(
        () =>
            aprobarMallaTurnosMes({
                pool,
                cliente: 'Cliente Demo',
                anio: 2026,
                mes: 6,
                variant: 'mallas',
                approver: { userId: null, email: 'cac@test.com', role: 'cac' },
                getColaboradorByCedula: async () => null,
                getLideresByCliente: async () => ['Lider'],
                listMallaTurnosCeldasRange: async () => [
                    { fecha: '2026-06-10', franja: '06_14', cedula: '123', nombre: 'Uno' }
                ]
            }),
        (err) => {
            assert.equal(err.status, 409);
            return true;
        }
    );
});
