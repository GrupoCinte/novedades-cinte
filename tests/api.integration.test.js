/**
 * Smoke contra API real (requiere backend en TEST_API_URL, p. ej. :3005).
 * No forma parte de `npm test` por defecto: en algunos entornos Windows el probe
 * a localhost puede demorar o bloquear el runner. Usar `npm run test:api-smoke`.
 */
const assert = require('node:assert/strict');
const { describe, it, before } = require('node:test');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3005';
const PROBE_MS = Number(process.env.TEST_API_PROBE_MS || 3000);
const FETCH_MS = Number(process.env.TEST_API_FETCH_MS || 10000);
let serverAvailable = false;

async function apiFetch(path, options = {}) {
  const { timeoutMs = FETCH_MS, signal: userSignal, ...rest } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
    signal: userSignal ?? AbortSignal.timeout(timeoutMs),
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
    await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(PROBE_MS),
    });
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

  it('GET /api/catalogos/clientes sin sesión: 401/403/429 o catálogo mínimo (200)', async () => {
    if (skipIfUnavailable()) return;
    const { status, body } = await apiFetch('/api/catalogos/clientes');
    assert.ok([401, 403, 429, 200].includes(status));
    if (status === 200) {
      assert.strictEqual(body?.ok, true);
      assert.ok(Array.isArray(body?.items));
    }
  });
});
