/**
 * Lee el informe CSV del import (filas insertado + cédula sintética) y la BD,
 * propone fusión sintético → colaborador real cuando el nombre coincide por fold
 * (sin tildes, espacios normalizados). Escribe SQL idempotente en migrations/.
 *
 * Uso:
 *   node scripts/generate-merge-sinteticos-sql.js [consultores-activos-import-report.csv]
 *
 * Requiere DATABASE_URL o DB_* (dotenv).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { normalizeCatalogValue } = require('../src/utils');
const { foldNombreForMatch } = require('../src/colaboradorDirectory');
const { buildFoldToCanonicoMap, matchExcelClienteABd, foldForMatch } = require('../src/cotizador/clienteNombreMatch');

function parseCsvRow(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (c === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i += 1;
            } else {
                inQ = !inQ;
            }
        } else if (c === ',' && !inQ) {
            out.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    out.push(cur);
    return out;
}

function sqlStr(s) {
    return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

function loadInsertRowsFromReport(reportPath) {
    const text = fs.readFileSync(reportPath, 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvRow(lines[i]);
        if (cols.length < 5) continue;
        if (cols[2] !== 'insertado' || cols[4] !== 'si') continue;
        rows.push({
            fila: cols[0],
            nombreExcel: cols[1],
            cedulaSintetica: cols[3].replace(/\D/g, ''),
            correo: cols[5] || '',
            cliente: cols[6] || '',
            lider: cols[7] || ''
        });
    }
    return rows;
}

async function buildFoldIndex(pool) {
    const q = await pool.query(
        `SELECT cedula, nombre, correo_cinte, cliente, lider_catalogo
         FROM colaboradores
         WHERE activo = TRUE`
    );
    /** @type {Map<string, { cedula: string, nombre: string }[]>} */
    const byFold = new Map();
    for (const row of q.rows) {
        const f = foldNombreForMatch(row.nombre);
        if (!f) continue;
        if (!byFold.has(f)) byFold.set(f, []);
        byFold.get(f).push({ cedula: row.cedula, nombre: row.nombre });
    }
    return byFold;
}

async function buildCatalogPairChecker(pool) {
    const dist = await pool.query(
        `SELECT DISTINCT cliente FROM clientes_lideres WHERE activo = TRUE ORDER BY cliente ASC`
    );
    const clientesList = dist.rows.map((r) => r.cliente);
    const { map: foldClienteMap } = buildFoldToCanonicoMap(clientesList);
    const pairs = await pool.query(`SELECT cliente, lider FROM clientes_lideres WHERE activo = TRUE`);
    /** @type {Map<string, string[]>} */
    const lideresPorCliente = new Map();
    for (const { cliente, lider } of pairs.rows) {
        if (!lideresPorCliente.has(cliente)) lideresPorCliente.set(cliente, []);
        lideresPorCliente.get(cliente).push(lider);
    }
    return (clienteRaw, liderRaw) => {
        const cliente = normalizeCatalogValue(clienteRaw);
        const lider = normalizeCatalogValue(liderRaw);
        if (!cliente || !lider) return false;
        const canon = matchExcelClienteABd(cliente, foldClienteMap) || cliente;
        const lista = lideresPorCliente.get(canon);
        if (!lista || lista.length === 0) return false;
        return lista.some((li) => foldForMatch(li) === foldForMatch(lider));
    };
}

async function main() {
    const reportPath =
        process.argv[2] || path.join(process.cwd(), 'consultores-activos-import-report.csv');
    if (!fs.existsSync(reportPath)) {
        console.error('No existe el informe:', reportPath);
        process.exit(1);
    }

    const insertRows = loadInsertRowsFromReport(reportPath);
    const syntheticSet = new Set(insertRows.map((r) => r.cedulaSintetica));

    const pool = process.env.DATABASE_URL
        ? new Pool({ connectionString: process.env.DATABASE_URL })
        : new Pool({
              host: process.env.DB_HOST || 'localhost',
              port: Number(process.env.DB_PORT || 5432),
              user: process.env.DB_USER || 'postgres',
              password: process.env.DB_PASSWORD || '',
              database: process.env.DB_NAME || 'novedades_cinte'
          });

    const byFold = await buildFoldIndex(pool);
    const catalogPairOk = await buildCatalogPairChecker(pool);

    const outName = `manual_merge_sinteticos_consultores_${new Date().toISOString().slice(0, 10)}.sql`;
    const outPath = path.join(process.cwd(), 'migrations', outName);

    const chunks = [];
    chunks.push('-- Fusión cédulas sintéticas (import consultores activos) → cédula real por match de nombre (fold).');
    chunks.push(`-- Fuente informe: ${reportPath.replace(/\\/g, '/')}`);
    chunks.push(`-- Generado: ${new Date().toISOString()}`);
    chunks.push('BEGIN;');
    chunks.push('');

    let mergeCount = 0;
    let ambiguous = 0;
    let noTarget = 0;

    for (const row of insertRows) {
        const fold = foldNombreForMatch(row.nombreExcel);
        const matches = (fold && byFold.get(fold)) || [];
        const synthIn = matches.filter((m) => syntheticSet.has(m.cedula));
        const realIn = matches.filter((m) => !syntheticSet.has(m.cedula));
        const correo = String(row.correo || '').trim().toLowerCase() || null;
        const cliente = normalizeCatalogValue(row.cliente);
        const lider = normalizeCatalogValue(row.lider);
        const parOk = catalogPairOk(cliente, lider);
        const notas = [];
        if (!parOk && (cliente || lider)) notas.push('par_cliente_lider_no_en_catalogo');

        if (realIn.length !== 1 || synthIn.length < 1) {
            if (matches.length > 1 && realIn.length > 1) ambiguous += 1;
            if (realIn.length === 0) noTarget += 1;
            chunks.push(
                `-- SKIP fila ${row.fila} ${sqlStr(row.nombreExcel)} sintética=${row.cedulaSintetica} (reales=${realIn.length}, sintéticas_en_match=${synthIn.length})`
            );
            chunks.push('');
            continue;
        }

        const targetCed = realIn[0].cedula;
        mergeCount += 1;
        chunks.push(
            `-- Merge fila Excel ${row.fila}: ${row.nombreExcel} → cédula real ${targetCed} (quita sintética(s) ${synthIn.map((s) => s.cedula).join(', ')})`
        );
        if (notas.length) chunks.push(`-- Notas: ${notas.join('; ')}`);

        const setParts = ['updated_at = NOW()'];
        if (correo) setParts.push(`correo_cinte = lower(${sqlStr(correo)})`);
        if (cliente) setParts.push(`cliente = ${sqlStr(cliente)}`);
        if (lider) setParts.push(`lider_catalogo = ${sqlStr(lider)}`);

        chunks.push(`UPDATE colaboradores SET ${setParts.join(', ')} WHERE cedula = ${sqlStr(targetCed)};`);

        for (const s of synthIn) {
            chunks.push(`UPDATE novedades SET cedula = ${sqlStr(targetCed)}, updated_at = NOW() WHERE cedula = ${sqlStr(s.cedula)};`);
            chunks.push(`DELETE FROM colaboradores WHERE cedula = ${sqlStr(s.cedula)};`);
        }
        chunks.push('');
    }

    chunks.push('COMMIT;');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, chunks.join('\n'), 'utf8');
    await pool.end();

    console.log('Listo.', {
        informe: reportPath,
        filas_insert_en_informe: insertRows.length,
        merges_en_sql: mergeCount,
        ambiguos_rechazados: ambiguous,
        sin_cedula_real_en_bd: noTarget,
        sql: outPath
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
