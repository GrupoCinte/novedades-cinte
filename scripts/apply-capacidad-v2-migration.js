/**
 * Migración única (dev): upsert clientes_lideres + merge colaboradores desde "Capacidad Abril 2026".
 * Normalización: cliente vía matchExcelClienteABd + normalizeCatalogValue; líder y textos con normalizeCatalogValue;
 * correo en minúsculas; cédula con normalizeCedula. GP: email exacto o nombre fold exacto; si un único usuario GP contiene el fold del Excel en full_name, se asigna.
 *
 * Uso:
 *   node scripts/apply-capacidad-v2-migration.js [--config scripts/capacidad-v2-migration.config.json]
 *   node scripts/apply-capacidad-v2-migration.js --apply [--config ...]
 *
 * Opciones: --deactivate-missing | --no-colaboradores
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const { normalizeCatalogValue, normalizeCedula } = require('../src/utils');
const { foldForMatch, buildFoldToCanonicoMap, matchExcelClienteABd } = require('../src/cotizador/clienteNombreMatch');

function parseArgs(argv) {
    const args = argv.slice(2);
    let configPath = path.resolve('scripts', 'capacidad-v2-migration.config.json');
    let apply = false;
    let deactivateMissing = false;
    let updateColaboradores = true;
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--config') {
            configPath = path.resolve(String(args[i + 1] || configPath));
            i += 1;
        } else if (args[i] === '--apply') apply = true;
        else if (args[i] === '--deactivate-missing') deactivateMissing = true;
        else if (args[i] === '--no-colaboradores') updateColaboradores = false;
    }
    return { configPath, apply, deactivateMissing, updateColaboradores };
}

function cell(row, key) {
    if (row[key] != null && row[key] !== '') return String(row[key]).trim();
    return '';
}

function normEmail(v) {
    const s = normalizeCatalogValue(v);
    if (!s) return null;
    return s.toLowerCase();
}

/**
 * Resuelve users.id (rol gp) desde texto GS del Excel.
 */
function resolveGpUserId(gsRaw, gpUsers) {
    const g = normalizeCatalogValue(gsRaw);
    if (!g || /^n\/a$/i.test(g)) return null;
    if (g.includes('@')) {
        const want = g.toLowerCase();
        const hits = gpUsers.filter((u) => String(u.email || '').toLowerCase() === want);
        return hits.length === 1 ? hits[0].id : null;
    }
    const foldG = foldForMatch(g);
    if (!foldG) return null;
    const exact = gpUsers.filter((u) => foldForMatch(u.full_name || '') === foldG);
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) return null;
    const contains = gpUsers.filter((u) => {
        const ff = foldForMatch(u.full_name || '');
        return ff && (ff.includes(foldG) || foldG.includes(ff));
    });
    if (contains.length === 1) return contains[0].id;
    return null;
}

async function loadGpUsers(pool) {
    const q = await pool.query(
        `SELECT id::text, lower(btrim(email)) AS email, btrim(full_name) AS full_name
         FROM users
         WHERE role = 'gp'::user_role AND is_active = TRUE`
    );
    return q.rows;
}

async function loadClientesCanonico(pool) {
    const q = await pool.query(`SELECT DISTINCT cliente FROM clientes_lideres WHERE activo = TRUE ORDER BY cliente`);
    return q.rows.map((r) => r.cliente);
}

async function loadExcelPairs(cfg, excelPath) {
    const sheet = cfg.sheetMaestro || 'Capacidad Abril 2026';
    const col = cfg.columns || {};
    const range = typeof cfg.headerRowIndex === 'number' ? cfg.headerRowIndex : 0;
    const wb = xlsx.readFile(excelPath, { cellDates: true });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: '', raw: false, range });
    const pairAgg = new Map();
    let line = range + 2;
    for (const r of rows) {
        const clienteEx = cell(r, col.cliente || 'CLIENTE');
        const liderEx = cell(r, col.lider || 'Lider');
        const gsEx = cell(r, col.gs || 'GS');
        if (!clienteEx || !liderEx) {
            line += 1;
            continue;
        }
        const k = `${foldForMatch(clienteEx)}|||${foldForMatch(liderEx)}`;
        if (!pairAgg.has(k)) {
            pairAgg.set(k, { cliente_excel: clienteEx, lider_excel: liderEx, gs_values: new Set(), line_first: line });
        }
        if (gsEx) pairAgg.get(k).gs_values.add(gsEx);
        line += 1;
    }
    return { rows, pairAgg, range };
}

function buildOpsFromAgg(pairAgg, foldToCliente, gpUsers) {
    const ops = [];
    for (const [, agg] of pairAgg) {
        const canonCliente =
            matchExcelClienteABd(agg.cliente_excel, foldToCliente) || normalizeCatalogValue(agg.cliente_excel);
        const liderNorm = normalizeCatalogValue(agg.lider_excel);
        const gsList = [...agg.gs_values];
        let gpId = null;
        if (gsList.length === 1) {
            gpId = resolveGpUserId(gsList[0], gpUsers);
        } else if (gsList.length > 1) {
            const ids = new Set();
            for (const g of gsList) {
                const id = resolveGpUserId(g, gpUsers);
                if (id) ids.add(id);
            }
            gpId = ids.size === 1 ? [...ids][0] : null;
        }
        ops.push({ cliente: canonCliente, lider: liderNorm, gp_user_id: gpId });
    }
    return ops;
}

function pairKeyFromExcelRow(clienteEx, liderEx, foldToCliente) {
    const canon =
        matchExcelClienteABd(clienteEx, foldToCliente) || normalizeCatalogValue(clienteEx);
    const liderNorm = normalizeCatalogValue(liderEx);
    return `${foldForMatch(canon)}|||${foldForMatch(liderNorm)}`;
}

async function main() {
    const opts = parseArgs(process.argv);
    const raw = fs.readFileSync(opts.configPath, 'utf8');
    const cfg = JSON.parse(raw);
    const excelPath = process.env.CAPACIDAD_XLSX_PATH
        ? path.resolve(process.env.CAPACIDAD_XLSX_PATH)
        : path.resolve(cfg.excelPath);
    if (!fs.existsSync(excelPath)) {
        console.error('No existe el Excel:', excelPath);
        process.exit(1);
    }

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const col = cfg.columns || {};
    const { rows, pairAgg } = await loadExcelPairs(cfg, excelPath);
    let clientesCanonico = await loadClientesCanonico(pool);
    let { map: foldToCliente } = buildFoldToCanonicoMap(clientesCanonico);
    const gpUsers = await loadGpUsers(pool);
    let ops = buildOpsFromAgg(pairAgg, foldToCliente, gpUsers);

    const dryPlan = {
        mode: opts.apply ? 'apply' : 'dry-run',
        pairs_upsert: ops.length,
        deactivate_missing: opts.deactivateMissing,
        update_colaboradores: opts.updateColaboradores
    };
    console.log(JSON.stringify(dryPlan, null, 2));

    if (!opts.apply) {
        console.log('Dry-run: no se escribió en la BD. Usa --apply para ejecutar.');
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const op of ops) {
            await client.query(
                `INSERT INTO clientes_lideres (cliente, lider, activo, gp_user_id)
                 VALUES ($1, $2, TRUE, $3::uuid)
                 ON CONFLICT (cliente, lider)
                 DO UPDATE SET
                   activo = TRUE,
                   gp_user_id = COALESCE(EXCLUDED.gp_user_id, clientes_lideres.gp_user_id),
                   updated_at = NOW()`,
                [op.cliente, op.lider, op.gp_user_id]
            );
        }

        clientesCanonico = await loadClientesCanonico(client);
        foldToCliente = buildFoldToCanonicoMap(clientesCanonico).map;
        ops = buildOpsFromAgg(pairAgg, foldToCliente, gpUsers);
        const gpByPairFold = new Map();
        for (const op of ops) {
            gpByPairFold.set(`${foldForMatch(op.cliente)}|||${foldForMatch(op.lider)}`, op.gp_user_id);
        }

        if (opts.updateColaboradores) {
            for (const r of rows) {
                const ced = normalizeCedula(cell(r, col.cedula || 'CÉDULA'));
                if (!ced) continue;
                const clienteEx = cell(r, col.cliente || 'CLIENTE');
                const liderEx = cell(r, col.lider || 'Lider');
                const canonCliente =
                    matchExcelClienteABd(clienteEx, foldToCliente) || normalizeCatalogValue(clienteEx);
                const liderNorm = normalizeCatalogValue(liderEx);
                const nombre = normalizeCatalogValue(cell(r, col.nombreConsultor || 'NOMBRE CONSULTOR'));
                if (!nombre) continue;
                const mail = normEmail(cell(r, col.emailCinte || 'EMAIL CINTE'));
                const pk = pairKeyFromExcelRow(clienteEx, liderEx, foldToCliente);
                const gpId = gpByPairFold.get(pk) || null;
                await client.query(
                    `INSERT INTO colaboradores (cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id)
                     VALUES ($1, $2, TRUE, $3, $4, $5, $6::uuid)
                     ON CONFLICT (cedula) DO UPDATE SET
                       nombre = EXCLUDED.nombre,
                       correo_cinte = COALESCE(EXCLUDED.correo_cinte, colaboradores.correo_cinte),
                       cliente = EXCLUDED.cliente,
                       lider_catalogo = EXCLUDED.lider_catalogo,
                       gp_user_id = COALESCE(EXCLUDED.gp_user_id, colaboradores.gp_user_id),
                       activo = TRUE,
                       updated_at = NOW()`,
                    [ced, nombre, mail, canonCliente, liderNorm, gpId]
                );
            }
        }

        if (opts.deactivateMissing) {
            const keys = new Set(ops.map((o) => `${foldForMatch(o.cliente)}|||${foldForMatch(o.lider)}`));
            const all = await client.query(`SELECT id, cliente, lider FROM clientes_lideres WHERE activo = TRUE`);
            for (const row of all.rows) {
                const k = `${foldForMatch(row.cliente)}|||${foldForMatch(row.lider)}`;
                if (!keys.has(k)) {
                    await client.query('UPDATE clientes_lideres SET activo = FALSE, updated_at = NOW() WHERE id = $1::uuid', [
                        row.id
                    ]);
                }
            }
        }

        await client.query('COMMIT');
        console.log(JSON.stringify({ ok: true, committed: true, pairs: ops.length, colaboradores_rows: rows.length }, null, 2));
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
