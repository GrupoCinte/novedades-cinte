const assert = require('node:assert/strict');
const { describe, it, before } = require('node:test');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3005';
let serverAvailable = false;

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body;
  try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, ok: res.ok, body };
}

function skipIfUnavailable() {
  if (!serverAvailable) return true;
  return false;
}

before(async () => {
  try {
    await fetch(`${BASE_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    serverAvailable = true;
  } catch {
    serverAvailable = false;
    console.warn(`[SKIP] API no disponible en ${BASE_URL}. Se omiten tests de integración.`);
  }
});

describe('Integración API (smoke)', () => {
  it('POST /api/login rechaza credenciales vacías', async () => {
    if (skipIfUnavailable()) return;
    const { status, body } = await apiFetch('/api/login', { method: 'POST', body: '{}' });
    assert.strictEqual(status, 400);
    assert.ok(Boolean(body?.message || body?.error));
  });

  it('GET /api/novedades sin token retorna 401', async () => {
    if (skipIfUnavailable()) return;
    const { status } = await apiFetch('/api/novedades');
    assert.strictEqual(status, 401);
  });

  it('GET /api/novedades con token inválido retorna 403', async () => {
    if (skipIfUnavailable()) return;
    const { status } = await apiFetch('/api/novedades', {
      headers: { Authorization: 'Bearer token-invalido-deliberadamente' }
    });
    assert.strictEqual(status, 403);
  });

  it('GET /api/catalogos/clientes responde 200 o rate-limit', async () => {
    if (skipIfUnavailable()) return;
    const { status } = await apiFetch('/api/catalogos/clientes');
    assert.ok([200, 429].includes(status));
  });
});
