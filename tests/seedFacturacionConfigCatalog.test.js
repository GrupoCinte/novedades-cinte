const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFoldToCanonicoMap } = require('../src/cotizador/clienteNombreMatch');
const {
    FACTURACION_CONFIG_CATALOG,
    resolveCanonicoForSeedRow
} = require('../scripts/seedFacturacionConfigCatalog');

test('catálogo seed: cada fila tiene regla_tipo válida y dia_corte 1-31', () => {
    const allowed = new Set(['HORAS_BASE', 'CALENDARIO_30', 'DIAS_HABILES', 'MES_CALENDARIO']);
    for (const row of FACTURACION_CONFIG_CATALOG) {
        assert.ok(allowed.has(row.reglaTipo), row.label);
        assert.ok(row.diaCorte >= 1 && row.diaCorte <= 31, row.label);
        if (row.reglaTipo === 'HORAS_BASE') {
            assert.ok(Number(row.horasBase) > 0, row.label);
        }
    }
});

test('resolveCanonicoForSeedRow encuentra BANCO POPULAR desde alias', () => {
    const { map } = buildFoldToCanonicoMap(['BANCO POPULAR', 'ALKOSTO']);
    const row = FACTURACION_CONFIG_CATALOG.find((r) => r.label === 'Banco popular');
    assert.equal(resolveCanonicoForSeedRow(row, map), 'BANCO POPULAR');
});
