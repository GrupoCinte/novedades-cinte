const test = require('node:test');
const assert = require('node:assert/strict');
const StreamPoller = require('../src/contratacion/streamPoller');
const { ContratacionWSServer } = require('../src/contratacion/websocketServer');
const { createDataLayer } = require('../src/dataLayer');

test('ContratacionWSServer.broadcast envía solo a clientes autenticados', () => {
  const server = Object.create(ContratacionWSServer.prototype);
  const sent = [];
  server.clients = new Set([
    { readyState: 1, __authenticated: true, send: (m) => sent.push(m) },
    { readyState: 1, __authenticated: false, send: (m) => sent.push(`x:${m}`) },
  ]);
  server.broadcast({ type: 'PING' });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /PING/);
});

test('StreamPoller.processRecord invoca callback con data mapeada', () => {
  const events = [];
  const poller = new StreamPoller('t', 'us-east-1', null, (e) => events.push(e));
  poller.processRecord({
    eventName: 'INSERT',
    dynamodb: {
      NewImage: { id: { S: '1' }, status: { S: 'ok' } }
    }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'INSERT');
});

test('createDataLayer expone consultas de catálogo sobre pool', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (String(sql).includes('SELECT DISTINCT cliente')) return { rows: [{ cliente: 'Cliente A' }] };
      if (String(sql).includes('SELECT lider')) return { rows: [{ lider: 'Lider A' }] };
      return { rows: [] };
    }
  };
  const dl = createDataLayer({
    pool,
    fs: { existsSync: () => false },
    xlsx: { readFile: () => ({}), utils: { sheet_to_json: () => [] } },
    CLIENTES_LIDERES_XLSX_PATH: '',
    normalizeCatalogValue: (v) => String(v || '').trim(),
    normalizeCedula: (v) => String(v || '').replace(/\D/g, ''),
    canRoleViewType: () => true,
    getAreaFromRole: () => 'Operaciones'
  });
  const clientes = await dl.getClientesList();
  const lideres = await dl.getLideresByCliente('Cliente A');
  assert.deepEqual(clientes, ['Cliente A']);
  assert.deepEqual(lideres, ['Lider A']);
  assert.ok(calls.length >= 2);
});
