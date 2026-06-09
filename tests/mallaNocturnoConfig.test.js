const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseHhMm,
    computeShiftHours,
    formatFranjaLabel,
    validateShiftTimes,
    buildConfigPayload
} = require('../src/directorio/mallaNocturnoConfig');

test('computeShiftHours 22:00→06:00 = 8', () => {
    assert.equal(computeShiftHours('22:00', '06:00'), 8);
});

test('computeShiftHours 20:00→04:00 = 8', () => {
    assert.equal(computeShiftHours('20:00', '04:00'), 8);
});

test('computeShiftHours mismo día 08:00→16:00 = 8', () => {
    assert.equal(computeShiftHours('08:00', '16:00'), 8);
});

test('computeShiftHours rechaza inicio = fin', () => {
    assert.equal(computeShiftHours('22:00', '22:00'), null);
});

test('validateShiftTimes rechaza formato inválido', () => {
    const r = validateShiftTimes('25:00', '06:00');
    assert.equal(r.ok, false);
});

test('buildConfigPayload arma label', () => {
    const p = buildConfigPayload('22:00', '06:00');
    assert.equal(p.horaInicio, '22:00');
    assert.equal(p.horaFin, '06:00');
    assert.equal(p.cantidadHoras, 8);
    assert.equal(p.label, '22:00–06:00 (8 h)');
});

test('formatFranjaLabel admite decimales', () => {
    assert.equal(formatFranjaLabel('08:00', '08:30', 0.5), '08:00–08:30 (0.5 h)');
});

test('parseHhMm minutos desde medianoche', () => {
    assert.equal(parseHhMm('22:00'), 22 * 60);
    assert.equal(parseHhMm('bad'), null);
});
