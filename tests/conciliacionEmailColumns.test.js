const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildConciliacionEmailTableHtml,
    normalizeColumnKeys,
    applyTemplateVars,
    getDefaultSelectedColumnKeys
} = require('../src/conciliaciones/conciliacionEmailColumns');
const { isServicioCompletoRevision } = require('../src/conciliaciones/conciliacionServicioCompleto');

test('isServicioCompletoRevision cuenta APROBADO_ANALISTA y legacy finanzas', () => {
    assert.equal(
        isServicioCompletoRevision({
            consultoresTotal: 2,
            estados: { APROBADO_ANALISTA: 2 }
        }),
        true
    );
    assert.equal(
        isServicioCompletoRevision({
            consultoresTotal: 2,
            estados: { APROBADO_ANALISTA: 1, PENDIENTE: 1 }
        }),
        false
    );
    assert.equal(
        isServicioCompletoRevision({
            consultoresTotal: 1,
            estados: { APROBADO_FINANZAS: 1 }
        }),
        true
    );
});

test('buildConciliacionEmailTableHtml respeta columnas seleccionadas', () => {
    const html = buildConciliacionEmailTableHtml(
        [{ cedula: '123', nombre: 'Ana', facturaCop: 1000 }],
        ['cedula', 'nombre']
    );
    assert.match(html, /123/);
    assert.match(html, /Ana/);
    assert.doesNotMatch(html, /1\.000/);
});

test('formatCellValue novedadesTipos une tipos o Sin novedades', () => {
    const html = buildConciliacionEmailTableHtml(
        [
            { cedula: '1', novedadesTipos: ['Vacaciones', 'Incapacidad'] },
            { cedula: '2', novedadesTipos: [] }
        ],
        ['cedula', 'novedadesTipos']
    );
    assert.match(html, /Vacaciones, Incapacidad/);
    assert.match(html, /Sin novedades/);
});

test('formatCellValue novedadesDetalle lista tipo + fecha/hora con br', () => {
    const { formatNovedadesCellLines, formatCreadoEnBogota } = require('../src/conciliaciones/conciliacionEmailColumns');
    const lines = formatNovedadesCellLines({
        novedadesDetalle: [
            { tipo: 'Vacaciones', creadoEn: '2026-07-10T20:42:00.000Z' },
            { tipo: 'HE', creadoEn: '2026-07-12T14:05:00.000Z' }
        ]
    });
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^Vacaciones · /);
    assert.match(lines[1], /^HE · /);
    assert.ok(formatCreadoEnBogota('2026-07-10T20:42:00.000Z'));

    const html = buildConciliacionEmailTableHtml(
        [
            {
                cedula: '1',
                novedadesDetalle: [
                    { tipo: 'Vacaciones', creadoEn: '2026-07-10T20:42:00.000Z' },
                    { tipo: 'Vacaciones', creadoEn: '2026-07-11T10:00:00.000Z' }
                ]
            }
        ],
        ['cedula', 'novedadesTipos']
    );
    assert.match(html, /Vacaciones · /);
    assert.match(html, /<br>/);
    // No colapsa dos cargas del mismo tipo
    const matches = html.match(/Vacaciones · /g) || [];
    assert.equal(matches.length, 2);
});

test('formatCellValue diasFacturables usa diasFacturables si no hay diasMes', () => {
    const html = buildConciliacionEmailTableHtml(
        [{ cedula: '1', diasFacturables: 31, prorrateoAplicado: false }],
        ['cedula', 'diasFacturables']
    );
    assert.match(html, />31</);
});

test('formatCellValue novedadesTipos cae a count si tipos vacíos', () => {
    const html = buildConciliacionEmailTableHtml(
        [{ cedula: '1', novedadesTipos: [], novedadesCount: 2 }],
        ['cedula', 'novedadesTipos']
    );
    assert.match(html, /2 aprobadas/);
});

test('applyTemplateVars sustituye placeholders', () => {
    const out = applyTemplateVars('Hola {nombreLider}, mes {mes}', {
        nombreLider: 'Carlos',
        mes: 'junio de 2026'
    });
    assert.equal(out, 'Hola Carlos, mes junio de 2026');
});

test('normalizeColumnKeys usa defaults si vacío', () => {
    const keys = normalizeColumnKeys([]);
    assert.ok(keys.length > 0);
    assert.deepEqual(keys, getDefaultSelectedColumnKeys());
});
