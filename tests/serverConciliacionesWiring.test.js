const test = require('node:test');
const assert = require('node:assert/strict');
const { createDataLayer } = require('../src/dataLayer');
const { assertConciliacionesRouteDeps } = require('../src/conciliaciones/registerConciliacionesRoutes');

function createDataLayerForTest() {
    const pool = {
        query: async () => ({ rows: [] }),
        connect: async () => ({
            query: async () => ({}),
            release: () => {}
        })
    };
    return createDataLayer({
        pool,
        fs: require('node:fs'),
        xlsx: require('xlsx'),
        CLIENTES_LIDERES_XLSX_PATH: '',
        normalizeCatalogValue: (v) => String(v || '').trim(),
        normalizeCedula: (v) => String(v || '').replace(/\D/g, ''),
        canRoleViewType: () => true,
        getAreaFromRole: () => 'novedades'
    });
}

test('createDataLayer expone handlers ForScope de facturación conciliaciones', () => {
    const dl = createDataLayerForTest();
    assert.equal(typeof dl.upsertConciliacionFacturacionForScope, 'function');
    assert.equal(typeof dl.upsertConciliacionFacturacionMasivaForScope, 'function');
    assert.equal(typeof dl.applyConciliacionFacturacionRevisionForScope, 'function');
    assert.equal(typeof dl.listConciliacionFacturacionHistorialForScope, 'function');
});

test('assertConciliacionesRouteDeps rechaza upsertConciliacionFacturacionMasivaForScope ausente', () => {
    const dl = createDataLayerForTest();
    assert.throws(
        () =>
            assertConciliacionesRouteDeps({
                app: {},
                verificarToken: () => {},
                allowAnyPanel: () => () => {},
                applyScope: () => {},
                listConciliacionesClientesForScope: dl.listConciliacionesClientesForScope,
                getConciliacionResumenPorClienteMesForScope: dl.getConciliacionResumenPorClienteMesForScope,
                getConciliacionResumenTodosClientesMesForScope: dl.getConciliacionResumenTodosClientesMesForScope,
                listConciliacionNovedadesDetalleForScope: dl.listConciliacionNovedadesDetalleForScope,
                getConciliacionesDashboardResumenForScope: dl.getConciliacionesDashboardResumenForScope,
                upsertConciliacionFacturacionForScope: dl.upsertConciliacionFacturacionForScope,
                applyConciliacionFacturacionRevisionForScope: dl.applyConciliacionFacturacionRevisionForScope,
                applyConciliacionFacturacionRevisionMasivaForScope: dl.applyConciliacionFacturacionRevisionMasivaForScope,
                listConciliacionFacturacionHistorialForScope: dl.listConciliacionFacturacionHistorialForScope,
                upsertConciliacionFacturacionMasivaForScope: undefined,
                listConciliacionesFacturacionForScope: dl.listConciliacionesFacturacionForScope
            }),
        /upsertConciliacionFacturacionMasivaForScope/
    );
});
