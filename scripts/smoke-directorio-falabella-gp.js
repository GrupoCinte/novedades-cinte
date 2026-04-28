#!/usr/bin/env node
/**
 * Humo API: cambio de GP en catálogo cliente–líder (mismo flujo que modal «Editar cliente»).
 *
 * Requiere backend en marcha y JWT con acceso al directorio (super_admin o cac).
 *
 * Uso (PowerShell):
 *   $env:SMOKE_DIRECTORIO_JWT="eyJ..."
 *   node scripts/smoke-directorio-falabella-gp.js
 *
 * Variables opcionales:
 *   SMOKE_API_URL   (default http://localhost:3005)
 *   SMOKE_CLIENTE   (default AGENCIA DE SEGUROS FALABELLA)
 *   SMOKE_CASES     (default 6) número de ciclos PATCH→GET
 */

require('dotenv').config();

const BASE = String(process.env.SMOKE_API_URL || process.env.TEST_API_URL || 'http://localhost:3005').replace(/\/$/, '');
const TOKEN = String(process.env.SMOKE_DIRECTORIO_JWT || process.env.TEST_DIRECTORIO_JWT || '').trim();
const CLIENTE = String(process.env.SMOKE_CLIENTE || 'AGENCIA DE SEGUROS FALABELLA').trim();
const NUM_CASES = Math.max(1, Math.min(20, Number(process.env.SMOKE_CASES || 6) || 6));

function authHeaders() {
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
    return h;
}

async function apiJson(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: { ...authHeaders(), ...(opts.headers || {}) }
    });
    let body = {};
    try {
        body = await res.json();
    } catch {
        body = {};
    }
    return { ok: res.ok, status: res.status, body };
}

async function fetchAllColaboradoresConCorreo() {
    const all = [];
    let offset = 0;
    const limit = 200;
    for (;;) {
        const u = new URLSearchParams({ activo: 'all', limit: String(limit), offset: String(offset) });
        const { ok, status, body } = await apiJson(`/api/directorio/colaboradores?${u}`);
        if (!ok) throw new Error(`colaboradores ${status}: ${body.error || body.message || 'error'}`);
        const items = body.items || [];
        all.push(...items);
        if (items.length < limit) break;
        offset += limit;
    }
    return all.filter((r) => String(r.correo_cinte || '').trim().length > 0);
}

async function fetchCatalogRowsForCliente(nombreCliente) {
    const u = new URLSearchParams({
        cliente: nombreCliente,
        activo: 'all',
        limit: '2000',
        offset: '0'
    });
    const { ok, status, body } = await apiJson(`/api/directorio/clientes-lideres?${u}`);
    if (!ok) throw new Error(`clientes-lideres ${status}: ${body.error || body.message || 'error'}`);
    return body.items || [];
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function patchRowGp(rowId, patch) {
    const { ok, status, body } = await apiJson(`/api/directorio/clientes-lideres/${encodeURIComponent(rowId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
    });
    if (!ok) throw new Error(`PATCH ${rowId} ${status}: ${body.error || body.message || JSON.stringify(body)}`);
    return body.item || body;
}

function distinctGpIds(rows) {
    return [...new Set(rows.map((r) => (r.gp_user_id ? String(r.gp_user_id) : '')).filter(Boolean))];
}

async function applyGpToAllRows(rowIds, cedula) {
    let lastGp = null;
    for (const id of rowIds) {
        const item = await patchRowGp(id, { gp_colaborador_cedula: cedula });
        lastGp = item.gp_user_id != null ? String(item.gp_user_id) : null;
    }
    return lastGp;
}

async function main() {
    if (!TOKEN) {
        console.error(
            '[smoke] Defina SMOKE_DIRECTORIO_JWT (Bearer del usuario con panel directorio, p. ej. super_admin).'
        );
        process.exit(1);
    }

    console.log(`[smoke] API ${BASE}`);
    console.log(`[smoke] Cliente: "${CLIENTE}" · casos: ${NUM_CASES}`);

    const rows0 = await fetchCatalogRowsForCliente(CLIENTE);
    if (!rows0.length) {
        console.error(`[smoke] No hay filas en clientes_lideres para cliente "${CLIENTE}".`);
        process.exit(1);
    }

    const canonicalCliente = String(rows0[0].cliente || CLIENTE).trim();
    const rowIds = rows0.map((r) => String(r.id)).filter(Boolean);
    if (!rowIds.length) throw new Error('Filas sin id');

    const snapshotGp = distinctGpIds(rows0);
    console.log(`[smoke] Filas catálogo: ${rowIds.length} · gp_user_id distintos iniciales: ${snapshotGp.length || 0}`);

    const colabs = await fetchAllColaboradoresConCorreo();
    if (!colabs.length) throw new Error('No hay colaboradores con correo Cinte para elegir GP');

    shuffleInPlace(colabs);
    const picks = colabs.slice(0, NUM_CASES);
    if (picks.length < NUM_CASES) {
        console.warn(`[smoke] Solo hay ${picks.length} colaboradores con correo; se ejecutarán ${picks.length} casos.`);
    }

    const originalGpByRow = new Map(rows0.map((r) => [String(r.id), r.gp_user_id != null ? String(r.gp_user_id) : null]));

    try {
        for (let i = 0; i < picks.length; i++) {
            const c = picks[i];
            const ced = String(c.cedula || '').trim();
            const nom = String(c.nombre || '').trim();
            console.log(`\n[smoke] Caso ${i + 1}/${picks.length}: GP colaborador cédula=${ced} (${nom})`);

            const before = await fetchCatalogRowsForCliente(canonicalCliente);
            const beforeGp = distinctGpIds(before);

            const expectedGp = await applyGpToAllRows(rowIds, ced);

            const after = await fetchCatalogRowsForCliente(canonicalCliente);
            const afterGp = distinctGpIds(after);
            const allMatch = after.every((r) => {
                const g = r.gp_user_id != null ? String(r.gp_user_id) : null;
                return g === expectedGp;
            });

            if (!allMatch || afterGp.length !== 1) {
                console.error('[smoke] FALLO: tras PATCH, gp_user_id no es único o no coincide en todas las filas.');
                console.error('  esperado gp_user_id:', expectedGp);
                console.error('  distintos tras GET:', afterGp);
                process.exit(1);
            }

            const changed = beforeGp.length !== afterGp.length || beforeGp[0] !== afterGp[0];
            console.log(`  OK gp_user_id=${afterGp[0]} ${changed ? '(cambió respecto al snapshot previo del caso)' : '(igual que antes en este caso)'}`);
        }

        console.log('\n[smoke] Restaurando gp_user_id original por fila (PATCH directo, sin cédula)...');
        for (const r of rows0) {
            const id = String(r.id);
            const orig = originalGpByRow.get(id);
            await patchRowGp(id, { gp_user_id: orig });
        }

        const finalRows = await fetchCatalogRowsForCliente(canonicalCliente);
        const finalGpSet = distinctGpIds(finalRows);
        const sameMultiset =
            finalGpSet.length === snapshotGp.length && finalGpSet.every((g) => snapshotGp.includes(g));
        if (!sameMultiset) {
            console.warn('[smoke] Aviso: gp distintos tras restaurar vs inicio; revisar datos o permisos.', {
                antes: snapshotGp,
                despues: finalGpSet
            });
        }

        console.log('\n[smoke] Todos los casos pasaron.');
        process.exit(0);
    } catch (e) {
        console.error('[smoke] Error:', e.message || e);
        process.exit(1);
    }
}

main();
