const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataLayer } = require('../src/dataLayer');

function createPoolRecorder() {
  const calls = [];
  return {
    calls,
    pool: {
      async query(sql, params) {
        calls.push({ sql: String(sql), params });
        return { rows: [], rowCount: 0 };
      }
    }
  };
}

function createDataLayerForTest(pool) {
  return createDataLayer({
    pool,
    fs: {},
    xlsx: {},
    CLIENTES_LIDERES_XLSX_PATH: '',
    normalizeCatalogValue: (v) => String(v || '').trim(),
    normalizeCedula: (v) => String(v || '').trim(),
    canRoleViewType: () => false,
    getAreaFromRole: () => null
  });
}

test('dataLayer: constraints FK usan DO+EXCEPTION duplicate_object (sin ruido en logs)', async () => {
  const { pool, calls } = createPoolRecorder();
  const dl = createDataLayerForTest(pool);

  await dl.ensureClientesLideresGpUserColumn();
  await dl.ensureColaboradoresDirectoryColumns();

  const sqlAll = calls.map((c) => c.sql).join('\n');

  assert.match(sqlAll, /ADD CONSTRAINT fk_clientes_lideres_gp_user/i);
  assert.match(sqlAll, /ADD CONSTRAINT fk_colaboradores_gp_user/i);
  assert.match(sqlAll, /ADD CONSTRAINT fk_novedades_gp_user_snapshot/i);
  assert.match(sqlAll, /EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
});

