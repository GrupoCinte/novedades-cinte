const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseHhMm,
    computeShiftHours,
    formatFranjaLabel,
    validateShiftTimes,
    buildConfigPayload,
    buildConfigPayloadFromDb,
    isNocturnoTime
} = require('../src/directorio/mallaNocturnoConfig');

test('computeShiftHours 22:00→06:00 = 8', () => {
    assert.equal(computeShiftHours('22:00', '06:00'), 8);
});

test('computeShiftHours 20:00→04:00 = 8', () => {
    assert.equal(computeShiftHours('20:00', '04:00'), 8);
});

test('computeShiftHours 18:00→06:00 = 12 (máximo nocturno)', () => {
    assert.equal(computeShiftHours('18:00', '06:00'), 12);
});

test('computeShiftHours 20:00→22:00 mismo tramo tarde = 2', () => {
    assert.equal(computeShiftHours('20:00', '22:00'), 2);
});

test('computeShiftHours 02:00→05:00 mismo tramo madrugada = 3', () => {
    assert.equal(computeShiftHours('02:00', '05:00'), 3);
});

test('computeShiftHours rechaza madrugada→tarde', () => {
    assert.equal(computeShiftHours('02:00', '22:00'), null);
});

test('computeShiftHours rechaza inicio = fin', () => {
    assert.equal(computeShiftHours('22:00', '22:00'), null);
});

test('validateShiftTimes rechaza formato inválido', () => {
    const r = validateShiftTimes('25:00', '06:00');
    assert.equal(r.ok, false);
});

test('validateShiftTimes rechaza horario diurno', () => {
    const r = validateShiftTimes('08:00', '06:00');
    assert.equal(r.ok, false);
    assert.match(r.error, /18:00/);
});

test('validateShiftTimes rechaza fin diurno', () => {
    const r = validateShiftTimes('22:00', '14:00');
    assert.equal(r.ok, false);
});

test('validateShiftTimes rechaza inicio = fin', () => {
    const r = validateShiftTimes('22:00', '22:00');
    assert.equal(r.ok, false);
    assert.match(r.error, /distintas/);
});

test('validateShiftTimes acepta 20:00→04:00', () => {
    const r = validateShiftTimes('20:00', '04:00');
    assert.equal(r.ok, true);
    assert.equal(r.cantidadHoras, 8);
});

test('isNocturnoTime ventana 18:00–06:00', () => {
    assert.equal(isNocturnoTime(parseHhMm('18:00')), true);
    assert.equal(isNocturnoTime(parseHhMm('23:59')), true);
    assert.equal(isNocturnoTime(parseHhMm('03:00')), true);
    assert.equal(isNocturnoTime(parseHhMm('06:00')), true);
    assert.equal(isNocturnoTime(parseHhMm('17:59')), false);
    assert.equal(isNocturnoTime(parseHhMm('06:01')), false);
    assert.equal(isNocturnoTime(parseHhMm('13:00')), false);
});

test('buildConfigPayloadFromDb usa defaults si BD tiene horario fuera de ventana', () => {
    const p = buildConfigPayloadFromDb('13:00:00', '06:00:00');
    assert.equal(p.horaInicio, '22:00');
    assert.equal(p.horaFin, '06:00');
    assert.equal(p.storedInvalid, true);
});

test('buildConfigPayloadFromDb respeta registro válido', () => {
    const p = buildConfigPayloadFromDb('20:00:00', '04:00:00');
    assert.equal(p.horaInicio, '20:00');
    assert.equal(p.horaFin, '04:00');
    assert.equal(p.storedInvalid, false);
});

test('buildConfigPayload arma label', () => {
    const p = buildConfigPayload('22:00', '06:00');
    assert.equal(p.horaInicio, '22:00');
    assert.equal(p.horaFin, '06:00');
    assert.equal(p.cantidadHoras, 8);
    assert.equal(p.label, '22:00–06:00 (8 h)');
});

test('formatFranjaLabel admite decimales', () => {
    assert.equal(formatFranjaLabel('22:00', '06:30', 8.5), '22:00–06:30 (8.5 h)');
});

test('resolveNocturnoDateTimeRange cruza medianoche', () => {
    const { resolveNocturnoDateTimeRange } = require('../src/directorio/mallaNocturnoConfig');
    assert.deepEqual(resolveNocturnoDateTimeRange('2026-06-10', '22:00', '06:00'), {
        fechaInicio: '2026-06-10',
        horaInicio: '22:00',
        fechaFin: '2026-06-11',
        horaFin: '06:00'
    });
});

test('resolveNocturnoDateTimeRange mismo tramo tarde', () => {
    const { resolveNocturnoDateTimeRange } = require('../src/directorio/mallaNocturnoConfig');
    assert.deepEqual(resolveNocturnoDateTimeRange('2026-06-10', '20:00', '22:00'), {
        fechaInicio: '2026-06-10',
        horaInicio: '20:00',
        fechaFin: '2026-06-10',
        horaFin: '22:00'
    });
});

test('parseHhMm minutos desde medianoche', () => {
    assert.equal(parseHhMm('22:00'), 22 * 60);
    assert.equal(parseHhMm('bad'), null);
});
