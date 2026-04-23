'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    splitHoursByBogotaDay,
    bogotaDateKeyFromMs,
    isSundayBogotaYmd,
    buildSundayReportedSetsFromHeRows,
    sundayTierFromCount,
    sundayStatsForConsultantMonth,
    resolveFallbackBogotaYmdFromRow,
    resolveHourSplitBogotaForRow
} = require('../src/heDomingoBogota');
const { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow } = require('../src/novedadHeTime');

test('splitHoursByBogotaDay: un segmento cae en un solo día local', () => {
    const start = Date.parse('2025-06-02T14:00:00Z');
    const end = Date.parse('2025-06-02T18:00:00Z');
    const m = splitHoursByBogotaDay(start, end);
    const key = bogotaDateKeyFromMs(start);
    assert.ok(m.has(key));
    assert.ok(Math.abs(m.get(key) - 4) < 0.01);
});

test('isSundayBogotaYmd: 2025-04-06 es domingo en Bogotá', () => {
    assert.equal(isSundayBogotaYmd('2025-04-06'), true);
    assert.equal(isSundayBogotaYmd('2025-04-07'), false);
});

test('resolveFallbackBogotaYmdFromRow: domingo noche Bogotá no se desplaza al lunes UTC', () => {
    const row = { fecha_inicio: new Date('2025-04-07T04:00:00.000Z'), cantidad_horas: 1 };
    assert.equal(resolveFallbackBogotaYmdFromRow(row), '2025-04-06');
    assert.equal(resolveFallbackDateKeyFromRow(row), '2025-04-07');
    assert.equal(isSundayBogotaYmd(resolveFallbackBogotaYmdFromRow(row)), true);
});

test('resolveHourSplitBogotaForRow: sin horas válidas usa fallback Bogotá', () => {
    const dep = { toUtcMsFromDateAndTime };
    const row = {
        fecha_inicio: new Date('2025-04-07T04:00:00.000Z'),
        hora_inicio: '',
        hora_fin: '',
        cantidad_horas: 3
    };
    const m = resolveHourSplitBogotaForRow(row, dep);
    assert.equal(m.get('2025-04-06'), 3);
});

test('agregación: dos novedades el mismo domingo cuentan un solo domingo reportado', () => {
    const dep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
    const buildConsultantKey = (row) => `${row.cedula}|||${row.nombre}`;
    const sunday = '2025-04-06';
    const rows = [
        {
            cedula: '1',
            nombre: 'A',
            fecha_inicio: new Date(`${sunday}T12:00:00.000Z`),
            fecha_fin: new Date(`${sunday}T14:00:00.000Z`),
            hora_inicio: '12:00:00',
            hora_fin: '14:00:00',
            cantidad_horas: 2
        },
        {
            cedula: '1',
            nombre: 'A',
            fecha_inicio: new Date(`${sunday}T15:00:00.000Z`),
            fecha_fin: new Date(`${sunday}T16:00:00.000Z`),
            hora_inicio: '15:00:00',
            hora_fin: '16:00:00',
            cantidad_horas: 1
        }
    ];
    const sets = buildSundayReportedSetsFromHeRows(rows, buildConsultantKey, dep);
    const st = sundayStatsForConsultantMonth(sets, buildConsultantKey(rows[0]), '2025-04');
    assert.equal(st.count, 1);
    assert.equal(sundayTierFromCount(st.count), 0);
});

test('agregación: dos domingos distintos en el mes → tier 2', () => {
    const dep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
    const buildConsultantKey = (row) => `${row.cedula}|||${row.nombre}`;
    const rows = [
        {
            cedula: '1',
            nombre: 'A',
            fecha_inicio: new Date('2025-04-06T12:00:00.000Z'),
            fecha_fin: new Date('2025-04-06T14:00:00.000Z'),
            hora_inicio: '12:00:00',
            hora_fin: '14:00:00',
            cantidad_horas: 2
        },
        {
            cedula: '1',
            nombre: 'A',
            fecha_inicio: new Date('2025-04-13T12:00:00.000Z'),
            fecha_fin: new Date('2025-04-13T14:00:00.000Z'),
            hora_inicio: '12:00:00',
            hora_fin: '14:00:00',
            cantidad_horas: 2
        }
    ];
    const sets = buildSundayReportedSetsFromHeRows(rows, buildConsultantKey, dep);
    const st = sundayStatsForConsultantMonth(sets, buildConsultantKey(rows[0]), '2025-04');
    assert.equal(st.count, 2);
    assert.equal(st.tier, 2);
});

test('agregación: tres domingos distintos → tier 3', () => {
    const dep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
    const buildConsultantKey = (row) => `${row.cedula}|||${row.nombre}`;
    const domingos = ['2025-04-06', '2025-04-13', '2025-04-20'];
    const rows = domingos.map((d) => ({
        cedula: '1',
        nombre: 'A',
        fecha_inicio: new Date(`${d}T12:00:00.000Z`),
        fecha_fin: new Date(`${d}T14:00:00.000Z`),
        hora_inicio: '12:00:00',
        hora_fin: '14:00:00',
        cantidad_horas: 2
    }));
    const sets = buildSundayReportedSetsFromHeRows(rows, buildConsultantKey, dep);
    const st = sundayStatsForConsultantMonth(sets, buildConsultantKey(rows[0]), '2025-04');
    assert.equal(st.count, 3);
    assert.equal(st.tier, 3);
});
