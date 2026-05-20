const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFechaFinCell, dateToSqlDate } = require('../scripts/pipelineExcelParse');

test('parseFechaFinCell: serial Excel ~2026', () => {
    const d = parseFechaFinCell(46000);
    assert.ok(d);
    assert.equal(dateToSqlDate(d), '2025-12-08');
});

test('parseFechaFinCell: string dd/mm/yyyy', () => {
    const d = parseFechaFinCell('15/08/2026');
    assert.equal(dateToSqlDate(d), '2026-08-15');
});

test('parseFechaFinCell: vacío', () => {
    assert.equal(parseFechaFinCell(''), null);
    assert.equal(parseFechaFinCell(null), null);
});
