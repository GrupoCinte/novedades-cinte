/**
 * Fase 2 (dev): lee el Excel de capacidad V2 y contrasta con clientes_lideres, colaboradores y users (gp).
 *
 * Uso:
 *   node scripts/analyze-capacidad-migration-dry-run.js [--config scripts/capacidad-v2-migration.config.json]
 *
 * Requiere .env con DB_* (conexión a desarrollo).
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
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--config') {
            configPath = path.resolve(String(args[i + 1] || configPath));
            i += 1;
        }
    }
    return { configPath };
}

function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function writeCsv(filePath, headers, rows) {
    const lines = [headers.join(',')];
    for (const r of rows) {
        lines.push(headers.map((h) => csvEscape(r[h])).join(','));
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function cell(row, key) {
    if (row[key] != null && row[key] !== '') return String(row[key]).trim();
    return '';
}

function resolveGpUserId(gsRaw, gpUsers) {
    const g = normalizeCatalogValue(gsRaw);
    if (!g || /^n\/a$/i.test(g)) return { status: 'none', gp_user_id: null, detail: 'vacío_o_NA' };
    if (g.includes('@')) {
        const want = g.toLowerCase();
        const hits = gpUsers.filter((u) => String(u.email || '').toLowerCase() === want);
        if (hits.length === 1) return { status: 'ok', gp_user_id: hits[0].id, detail: 'email' };
        if (hits.length === 0) return { status: 'no_match', gp_user_id: null, detail: 'email_sin_usuario' };
        return { status: 'ambiguous', gp_user_id: null, detail: 'email_duplicado' };
    }
    const foldG = foldForMatch(g);
    if (!foldG) return { status: 'no_match', gp_user_id: null, detail: 'gs_vacio_fold' };
    const exact = gpUsers.filter((u) => foldForMatch(u.full_name || '') === foldG);
    if (exact.length === 1) return { status: 'ok', gp_user_id: exact[0].id, detail: 'full_name_fold' };
    if (exact.length > 1) return { status: 'ambiguous', gp_user_id: null, detail: `nombre_fold_${exact.length}` };
    const contains = gpUsers.filter((u) => {
        const ff = foldForMatch(u.full_name || '');
        return ff && (ff.includes(foldG) || foldG.includes(ff));
    });
    if (contains.length === 1) return { status: 'ok', gp_user_id: contains[0].id, detail: 'full_name_contains_fold' };
    if (contains.length > 1) return { status: 'ambiguous', gp_user_id: null, detail: `contains_${contains.length}` };
    return { status: 'no_match', gp_user_id: null, detail: 'nombre_fold_sin_match' };
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
    const q = await pool.query(
        `SELECT DISTINCT cliente FROM clientes_lideres WHERE activo = TRUE ORDER BY cliente`
    );
    return q.rows.map((r) => r.cliente);
}

async function loadCatalogPairs(pool) {
    const q = await pool.query(
        `SELECT cliente, lider, gp_user_id::text AS gp_user_id
         FROM clientes_lideres
         WHERE activo = TRUE`
    );
    const set = new Set();
    const byKey = new Map();
    for (const r of q.rows) {
        const c = normalizeCatalogValue(r.cliente);
        const l = normalizeCatalogValue(r.lider);
        const k = `${foldForMatch(c)}|||${foldForMatch(l)}`;
        set.add(k);
        byKey.set(k, { cliente: c, lider: l, gp_user_id: r.gp_user_id || '' });
    }
    return { set, byKey };
}

async function main() {
    const { configPath } = parseArgs(process.argv);
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    const excelPath = process.env.CAPACIDAD_XLSX_PATH
        ? path.resolve(process.env.CAPACIDAD_XLSX_PATH)
        : path.resolve(cfg.excelPath);
    if (!fs.existsSync(excelPath)) {
        console.error('No existe el Excel:', excelPath);
        process.exit(1);
    }

    const outDir = path.resolve(cfg.outDir || 'scripts/out');
    const prefix = cfg.outPrefix || 'dev_capacidad_v2';
    const sheet = cfg.sheetMaestro || 'Capacidad Abril 2026';
    const col = cfg.columns || {};
    const range = typeof cfg.headerRowIndex === 'number' ? cfg.headerRowIndex : 0;

    const wb = xlsx.readFile(excelPath, { cellDates: true });
    if (!wb.SheetNames.includes(sheet)) {
        console.error('Hoja no encontrada:', sheet, '→', wb.SheetNames.join(', '));
        process.exit(1);
    }
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: '', raw: false, range });

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        const clientesCanonico = await loadClientesCanonico(pool);
        const { map: foldToCliente, warnings } = buildFoldToCanonicoMap(clientesCanonico);
        const catalog = await loadCatalogPairs(pool);
        const gpUsers = await loadGpUsers(pool);

        /** @type {Map<string, { cliente_excel: string, lider_excel: string, gs_values: Set<string>, line_first: number }>} */
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
                pairAgg.set(k, {
                    cliente_excel: clienteEx,
                    lider_excel: liderEx,
                    gs_values: new Set(),
                    line_first: line
                });
            }
            const agg = pairAgg.get(k);
            if (gsEx) agg.gs_values.add(gsEx);
            line += 1;
        }

        const pairRows = [];
        for (const [, agg] of pairAgg) {
            const canonCliente = matchExcelClienteABd(agg.cliente_excel, foldToCliente) || normalizeCatalogValue(agg.cliente_excel);
            const liderNorm = normalizeCatalogValue(agg.lider_excel);
            const foldKey = `${foldForMatch(canonCliente)}|||${foldForMatch(liderNorm)}`;
            const inCatalog = catalog.set.has(foldKey);
            const dbRow = catalog.byKey.get(foldKey);
            const gsPick = [...agg.gs_values].sort().join(' | ');
            const gpRes = gsPick ? resolveGpUserId(gsPick.split(' | ')[0], gpUsers) : { status: 'none', gp_user_id: null, detail: 'sin_gs_en_filas' };
            if (agg.gs_values.size > 1) {
                gpRes.detail = `${gpRes.detail};multi_gs:${[...agg.gs_values].join('~')}`;
            }
            let gpVsDb = '';
            if (dbRow && dbRow.gp_user_id && gpRes.gp_user_id && dbRow.gp_user_id !== gpRes.gp_user_id) {
                gpVsDb = 'distinto_bd';
            } else if (dbRow && dbRow.gp_user_id && !gpRes.gp_user_id && gpRes.status !== 'none') {
                gpVsDb = 'excel_no_resuelve_bd_tiene';
            }

            pairRows.push({
                line_first: agg.line_first,
                cliente_excel: agg.cliente_excel,
                lider_excel: agg.lider_excel,
                cliente_canon: canonCliente,
                lider_norm: liderNorm,
                cliente_match_bd: Boolean(matchExcelClienteABd(agg.cliente_excel, foldToCliente)),
                par_en_catalogo: inCatalog,
                gs_valores: gsPick,
                gp_status: gpRes.status,
                gp_user_id_resuelto: gpRes.gp_user_id || '',
                gp_detail: gpRes.detail,
                gp_vs_bd: gpVsDb,
                db_gp_user_id: dbRow ? dbRow.gp_user_id : ''
            });
        }

        const colabRows = [];
        line = range + 2;
        for (const r of rows) {
            const ced = normalizeCedula(cell(r, col.cedula || 'CÉDULA'));
            const nombre = normalizeCatalogValue(cell(r, col.nombreConsultor || 'NOMBRE CONSULTOR'));
            const mail = normalizeCatalogValue(cell(r, col.emailCinte || 'EMAIL CINTE'));
            const clienteEx = cell(r, col.cliente || 'CLIENTE');
            const liderEx = cell(r, col.lider || 'Lider');
            if (!ced) {
                line += 1;
                continue;
            }
            const q = await pool.query(
                `SELECT cedula, nombre, cliente, lider_catalogo, gp_user_id::text AS gp_user_id
                 FROM colaboradores WHERE cedula = $1 LIMIT 1`,
                [ced]
            );
            const db = q.rows[0] || null;
            colabRows.push({
                line,
                cedula: ced,
                nombre_excel: nombre,
                email_excel: mail,
                cliente_excel: clienteEx,
                lider_excel: liderEx,
                en_db: Boolean(db),
                nombre_db: db ? db.nombre : '',
                cliente_db: db ? db.cliente || '' : '',
                lider_db: db ? db.lider_catalogo || '' : '',
                gp_user_id_db: db ? db.gp_user_id || '' : ''
            });
            line += 1;
        }

        const excelClientesFold = new Set();
        for (const r of rows) {
            const c = cell(r, col.cliente || 'CLIENTE');
            if (c) excelClientesFold.add(foldForMatch(c));
        }
        const soloBd = [];
        for (const c of clientesCanonico) {
            const f = foldForMatch(c);
            if (!excelClientesFold.has(f)) {
                soloBd.push({ cliente_bd: c, fold: f });
            }
        }

        const resumen = {
            generatedAt: new Date().toISOString(),
            excelPath,
            sheet,
            dbHost: process.env.DB_HOST || 'localhost',
            dbName: process.env.DB_NAME || 'novedades_cinte',
            foldMapWarnings: warnings,
            counts: {
                excel_data_rows: rows.length,
                distinct_pairs: pairRows.length,
                colaboradores_rows_con_cedula: colabRows.filter((x) => x.cedula).length,
                clientes_solo_bd: soloBd.length,
                gp_users_activos: gpUsers.length
            },
            pairs: {
                en_catalogo: pairRows.filter((p) => p.par_en_catalogo).length,
                no_en_catalogo: pairRows.filter((p) => !p.par_en_catalogo).length,
                gp_ok: pairRows.filter((p) => p.gp_status === 'ok').length,
                gp_no_match: pairRows.filter((p) => p.gp_status === 'no_match').length,
                gp_ambiguous: pairRows.filter((p) => p.gp_status === 'ambiguous').length,
                gp_vs_bd_distinto: pairRows.filter((p) => p.gp_vs_bd === 'distinto_bd').length
            },
            colaboradores: {
                con_cedula_en_excel: colabRows.filter((c) => c.cedula).length,
                encontrados_en_db: colabRows.filter((c) => c.en_db).length,
                no_en_db: colabRows.filter((c) => c.cedula && !c.en_db).length
            }
        };

        writeCsv(
            path.join(outDir, `${prefix}_pairs.csv`),
            [
                'line_first',
                'cliente_excel',
                'lider_excel',
                'cliente_canon',
                'lider_norm',
                'cliente_match_bd',
                'par_en_catalogo',
                'gs_valores',
                'gp_status',
                'gp_user_id_resuelto',
                'gp_detail',
                'gp_vs_bd',
                'db_gp_user_id'
            ],
            pairRows
        );
        writeCsv(
            path.join(outDir, `${prefix}_colaboradores.csv`),
            [
                'line',
                'cedula',
                'nombre_excel',
                'email_excel',
                'cliente_excel',
                'lider_excel',
                'en_db',
                'nombre_db',
                'cliente_db',
                'lider_db',
                'gp_user_id_db'
            ],
            colabRows
        );
        writeCsv(path.join(outDir, `${prefix}_clientes_solo_bd.csv`), ['cliente_bd', 'fold'], soloBd);

        const jsonPath = path.join(outDir, `${prefix}_resumen.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(resumen, null, 2), 'utf8');

        console.log(JSON.stringify({ ok: true, ...resumen.counts, pairs: resumen.pairs, colaboradores: resumen.colaboradores, outputs: {
            pairs: path.join(outDir, `${prefix}_pairs.csv`),
            colaboradores: path.join(outDir, `${prefix}_colaboradores.csv`),
            clientes_solo_bd: path.join(outDir, `${prefix}_clientes_solo_bd.csv`),
            resumen: jsonPath
        } }, null, 2));
    } finally {
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
