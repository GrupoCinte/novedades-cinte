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
