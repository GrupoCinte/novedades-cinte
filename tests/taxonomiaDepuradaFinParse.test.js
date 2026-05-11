const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
    parseTaxonomiaDepuradaFinWorkbook,
    SHEET_NAME,
    HEADER_MARKER
} = require('../src/cotizador/taxonomiaDepuradaFinParse');

test('parseTaxonomiaDepuradaFinWorkbook: localiza fila de encabezado por marcador y vuelca filas', () => {
    const aoa = [
        ['Título bloque'],
        ['', HEADER_MARKER, 'Otra columna', ''],
        ['', 'Valor rol', 'B1', ''],
        ['', '', '', ''],
        ['', 'Segundo rol', 'B2', 'x']
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

    const { headers, rows } = parseTaxonomiaDepuradaFinWorkbook(wb);

    assert.ok(headers.includes(HEADER_MARKER));
    assert.equal(rows.length, 2);
    assert.equal(rows[0][HEADER_MARKER], 'Valor rol');
    assert.equal(rows[0]['Otra columna'], 'B1');
    assert.equal(rows[1][HEADER_MARKER], 'Segundo rol');
});

test('parseTaxonomiaDepuradaFinWorkbook: fila completamente vacía se omite', () => {
    const aoa = [
        ['T'],
        [HEADER_MARKER, 'ColA'],
        ['solo A', ''],
        ['', '']
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    const { rows } = parseTaxonomiaDepuradaFinWorkbook(wb);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['ColA'], '');
});
