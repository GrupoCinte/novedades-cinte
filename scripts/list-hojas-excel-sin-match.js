/**
 * Lista hojas del Excel sin resolución a cliente (ni por nombre en BD ni por cotizador_import_alias).
 * Uso: node scripts/list-hojas-excel-sin-match.js "C:\\ruta\\archivo.xlsx"
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const { createCotizadorStore } = require('../src/cotizador/cotizadorStore');
const { buildFoldToCanonicoMap, matchExcelClienteABd } = require('../src/cotizador/clienteNombreMatch');

const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
if (!DB_PASSWORD) {
    console.error('Falta DB_PASSWORD');
    process.exit(1);
}
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'cinte_app',
    password: DB_PASSWORD
});

function normHojaKey(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function findAliasRow(aliasRows, sheetName) {
    const k = normHojaKey(sheetName);
    for (const r of aliasRows) {
        if (normHojaKey(r.hoja_excel) === k) return r;
    }
    return null;
}

function describeAlias(row) {
    if (row.tipo === 'CREAR') return `nuevo cliente: ${row.cliente}`;
    if (row.tipo === 'DIRECTV') return `DIRECTV (${row.pais_directv || '?'})`;
    return String(row.cliente);
}

async function main() {
    const excelPath = process.argv[2] || 'C:\\Users\\pc\\Desktop\\PERFILES CLIENTES .xlsx';
    if (!fs.existsSync(excelPath)) {
        console.error('No existe:', excelPath);
        process.exit(1);
    }
    const store = createCotizadorStore({ pool, fs });
    await store.ensureReady();
    const aliasRows = await store.getImportAliases();

    const q = await pool.query(
        `SELECT DISTINCT cliente FROM clientes_lideres WHERE activo = TRUE ORDER BY cliente`
    );
    const listaBd = q.rows.map((r) => r.cliente).filter(Boolean);
    const { map: foldToCanonico } = buildFoldToCanonicoMap(listaBd);
    const wb = xlsx.readFile(excelPath);
    const sin = [];
    const ok = [];
    for (const sheetName of wb.SheetNames) {
        const raw = normHojaKey(sheetName);
        if (!raw) continue;
        const row = findAliasRow(aliasRows, sheetName);
        if (row) {
            ok.push(`${raw} → ${describeAlias(row)}`);
            continue;
        }
        const canon = matchExcelClienteABd(raw, foldToCanonico);
        if (canon) ok.push(`${raw} → ${canon}`);
        else sin.push(raw);
    }
    console.log('Hojas SIN resolución (' + sin.length + '):\n');
    sin.forEach((s) => console.log('  •', s));
    console.log('\nHojas resueltas (' + ok.length + '):');
    ok.forEach((s) => console.log('  ', s));
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
