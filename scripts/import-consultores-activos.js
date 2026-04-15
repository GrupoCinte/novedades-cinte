/**
 * Importa "Listado consultores activos" (Excel) al directorio colaboradores.
 * Match por nombre normalizado; sin match inserta fila con cédula sintética de 8 dígitos.
 *
 * Documentación de cédulas sintéticas: ../docs/colaboradores-cedulas-sinteticas.md
 *
 * Uso:
 *   node scripts/import-consultores-activos.js "C:\\ruta\\Listado consultores activos.xlsx" [informe.csv] [--rematch-report=informe_previo.csv]
 *
 * `--rematch-report`: cédulas marcadas insertado/si en ese CSV se tratan como sintéticas; si hay
 * varias filas con el mismo nombre (fold) y exactamente una no es sintética, fusiona en la real
 * (actualiza datos del Excel, borra sintética(s), repunta novedades.cedula).
 *
 * Requiere DATABASE_URL o variables DB_* como el servidor (dotenv).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const xlsx = require('xlsx');
const { normalizeCatalogValue } = require('../src/utils');
const {
    foldNombreForMatch,
    allocateUniqueSyntheticCedula
} = require('../src/colaboradorDirectory');
const { buildFoldToCanonicoMap, matchExcelClienteABd, foldForMatch } = require('../src/cotizador/clienteNombreMatch');

function normalizeHeaderKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function pickCell(row, aliases) {
    const byNorm = {};
    for (const key of Object.keys(row)) {
        byNorm[normalizeHeaderKey(key)] = row[key];
    }
    for (const a of aliases) {
        const v = byNorm[normalizeHeaderKey(a)];
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

function escapeCsvField(s) {
    const t = String(s ?? '');
    if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
}

async function resolveGpUserId(pool, gsRaw) {
    const email = String(gsRaw || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return null;
    const q = await pool.query(
        `SELECT id FROM users
         WHERE lower(btrim(email)) = $1 AND role = 'gp'::user_role AND is_active = TRUE
         LIMIT 1`,
        [email]
    );
    return q.rows[0]?.id || null;
}

async function userEmailExists(pool, emailRaw) {
    const e = String(emailRaw || '').trim().toLowerCase();
    if (!e) return false;
    const q = await pool.query('SELECT 1 FROM users WHERE lower(btrim(email)) = $1 LIMIT 1', [e]);
    return Boolean(q.rows[0]);
}

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

/**
 * @param {string} reportPath
 * @returns {Set<string>}
 */
function loadSyntheticCedulasFromReport(reportPath) {
    const set = new Set();
    if (!fs.existsSync(reportPath)) return set;
    const lines = fs.readFileSync(reportPath, 'utf8').split(/\r?\n/);
    for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line || !line.trim()) continue;
        const cols = parseCsvRow(line);
        if (cols.length < 5) continue;
        if (cols[2] === 'insertado' && cols[4] === 'si') set.add(String(cols[3]).replace(/\D/g, ''));
    }
    return set;
}

async function buildColaboradoresFoldIndex(pool) {
    const q = await pool.query(
        `SELECT cedula, nombre, correo_cinte, cliente, lider_catalogo
         FROM colaboradores
         WHERE activo = TRUE`
    );
    /** @type {Map<string, { cedula: string, nombre: string, correo_cinte: string|null, cliente: string|null, lider_catalogo: string|null }[]>} */
    const byFold = new Map();
    for (const row of q.rows) {
        const f = foldNombreForMatch(row.nombre);
        if (!f) continue;
        if (!byFold.has(f)) byFold.set(f, []);
        byFold.get(f).push(row);
    }
    return byFold;
}

/**
 * @param {Map<string, unknown[]>} byFold
 * @param {string} cedula
 */
function removeCedulaFromFoldIndex(byFold, cedula) {
    for (const [f, arr] of byFold) {
        const idx = arr.findIndex((r) => r.cedula === cedula);
        if (idx === -1) continue;
        const next = arr.slice(0, idx).concat(arr.slice(idx + 1));
        if (next.length === 0) byFold.delete(f);
        else byFold.set(f, next);
        return;
    }
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
    const argv = process.argv.slice(2);
    const posArgs = argv.filter((a) => !a.startsWith('--'));
    const rematchArg = argv.find((a) => a.startsWith('--rematch-report='));
    const rematchReportPath = rematchArg ? rematchArg.slice('--rematch-report='.length).trim() : null;

    const excelPath = posArgs[0];
    const reportPath = posArgs[1] || path.join(process.cwd(), 'consultores-activos-import-report.csv');
    if (!excelPath) {
        console.error(
            'Uso: node scripts/import-consultores-activos.js <ruta.xlsx> [informe.csv] [--rematch-report=informe_previo.csv]'
        );
        process.exit(1);
    }
    if (!fs.existsSync(excelPath)) {
        console.error('No existe el archivo:', excelPath);
        process.exit(1);
    }

    const pool = process.env.DATABASE_URL
        ? new Pool({ connectionString: process.env.DATABASE_URL })
        : new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'novedades_cinte'
        });

    const syntheticSet = rematchReportPath ? loadSyntheticCedulasFromReport(rematchReportPath) : new Set();
    const byFold = await buildColaboradoresFoldIndex(pool);
    const catalogPairOk = await buildCatalogPairChecker(pool);

    const wb = xlsx.readFile(excelPath);
    const sheetName = wb.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

    const reportLines = [
        [
            'fila',
            'nombre_excel',
            'accion',
            'cedula',
            'cedula_sintetica',
            'correo',
            'cliente',
            'lider',
            'gp_resuelto',
            'usuario_email_match',
            'par_catalogo_ok',
            'notas'
        ].join(',')
    ];

    let updated = 0;
    let inserted = 0;
    let merged = 0;
    let ambiguous = 0;
    let skipped = 0;

    let rowIndex = 0;
    for (const row of rows) {
        rowIndex += 1;
        const nombreExcel = pickCell(row, ['NOMBRE CONSULTOR', 'COLABORADOR', 'NOMBRE']);
        const emailCinte = pickCell(row, ['EMAIL CINTE', 'EMAIL', 'CORREO']);
        const clienteRaw = pickCell(row, ['CLIENTE']);
        const liderRaw = pickCell(row, ['Lider', 'LÍDER', 'LIDER']);
        const gsRaw = pickCell(row, ['GS', 'GP']);

        const nombreFold = foldNombreForMatch(nombreExcel);
        if (!nombreFold) {
            skipped += 1;
            reportLines.push(
                [
                    rowIndex,
                    escapeCsvField(nombreExcel),
                    'omitido',
                    '',
                    'no',
                    escapeCsvField(emailCinte),
                    escapeCsvField(clienteRaw),
                    escapeCsvField(liderRaw),
                    '',
                    '',
                    '',
                    escapeCsvField('Sin nombre')
                ].join(',')
            );
            continue;
        }

        const cliente = normalizeCatalogValue(clienteRaw);
        const lider = normalizeCatalogValue(liderRaw);
        const correoNorm = String(emailCinte || '').trim().toLowerCase() || null;

        const matches = [...(byFold.get(nombreFold) || [])];

        let gpId = null;
        try {
            gpId = await resolveGpUserId(pool, gsRaw);
        } catch (e) {
            /* GP opcional */
        }

        const emailUserMatch = await userEmailExists(pool, correoNorm);
        const parOk = catalogPairOk(cliente, lider);
        const notas = [];

        if (!parOk && (cliente || lider)) notas.push('par_cliente_lider_no_en_catalogo');

        if (syntheticSet.size > 0 && matches.length > 1) {
            const synthM = matches.filter((m) => syntheticSet.has(m.cedula));
            const realM = matches.filter((m) => !syntheticSet.has(m.cedula));
            if (synthM.length >= 1 && realM.length === 1) {
                const target = realM[0];
                const conn = await pool.connect();
                try {
                    await conn.query('BEGIN');
                    await conn.query(
                        `UPDATE colaboradores SET
                            correo_cinte = CASE WHEN $1::text IS NOT NULL AND btrim($1) <> '' THEN lower(btrim($1)) ELSE correo_cinte END,
                            cliente = CASE WHEN $2::text IS NOT NULL AND btrim($2) <> '' THEN $2 ELSE cliente END,
                            lider_catalogo = CASE WHEN $3::text IS NOT NULL AND btrim($3) <> '' THEN $3 ELSE lider_catalogo END,
                            gp_user_id = COALESCE($4, gp_user_id),
                            activo = TRUE,
                            updated_at = NOW()
                         WHERE cedula = $5`,
                        [correoNorm, cliente || null, lider || null, gpId, target.cedula]
                    );
                    for (const s of synthM) {
                        await conn.query(
                            `UPDATE novedades SET cedula = $1, updated_at = NOW() WHERE cedula = $2`,
                            [target.cedula, s.cedula]
                        );
                        await conn.query('DELETE FROM colaboradores WHERE cedula = $1', [s.cedula]);
                        removeCedulaFromFoldIndex(byFold, s.cedula);
                    }
                    await conn.query('COMMIT');
                } catch (e) {
                    await conn.query('ROLLBACK');
                    throw e;
                } finally {
                    conn.release();
                }
                merged += 1;
                notas.push('fusion_sintetico_a_real');
                reportLines.push(
                    [
                        rowIndex,
                        escapeCsvField(nombreExcel),
                        'fusionado',
                        escapeCsvField(target.cedula),
                        'no',
                        escapeCsvField(correoNorm || ''),
                        escapeCsvField(cliente),
                        escapeCsvField(lider),
                        gpId ? 'si' : 'no',
                        emailUserMatch ? 'si' : 'no',
                        parOk ? 'si' : 'no',
                        escapeCsvField(notas.join(';'))
                    ].join(',')
                );
                continue;
            }
        }

        if (matches.length > 1) {
            ambiguous += 1;
            notas.push('ambiguo_varias_cedulas_mismo_nombre');
            reportLines.push(
                [
                    rowIndex,
                    escapeCsvField(nombreExcel),
                    'ambiguo',
                    escapeCsvField(matches.map((m) => m.cedula).join('|')),
                    'no',
                    escapeCsvField(correoNorm || ''),
                    escapeCsvField(cliente),
                    escapeCsvField(lider),
                    gpId ? 'si' : 'no',
                    emailUserMatch ? 'si' : 'no',
                    parOk ? 'si' : 'no',
                    escapeCsvField(notas.join(';'))
                ].join(',')
            );
            continue;
        }

        if (matches.length === 1) {
            const ced = matches[0].cedula;
            await pool.query(
                `UPDATE colaboradores SET
                    correo_cinte = CASE WHEN $1::text IS NOT NULL AND btrim($1) <> '' THEN lower(btrim($1)) ELSE correo_cinte END,
                    cliente = CASE WHEN $2::text IS NOT NULL AND btrim($2) <> '' THEN $2 ELSE cliente END,
                    lider_catalogo = CASE WHEN $3::text IS NOT NULL AND btrim($3) <> '' THEN $3 ELSE lider_catalogo END,
                    gp_user_id = COALESCE($4, gp_user_id),
                    activo = TRUE,
                    updated_at = NOW()
                 WHERE cedula = $5`,
                [correoNorm, cliente || null, lider || null, gpId, ced]
            );
            updated += 1;
            reportLines.push(
                [
                    rowIndex,
                    escapeCsvField(nombreExcel),
                    'actualizado',
                    escapeCsvField(ced),
                    'no',
                    escapeCsvField(correoNorm || ''),
                    escapeCsvField(cliente),
                    escapeCsvField(lider),
                    gpId ? 'si' : 'no',
                    emailUserMatch ? 'si' : 'no',
                    parOk ? 'si' : 'no',
                    escapeCsvField(notas.join(';'))
                ].join(',')
            );
            continue;
        }

        const synthetic = await allocateUniqueSyntheticCedula(pool);
        await pool.query(
            `INSERT INTO colaboradores (cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id)
             VALUES ($1, $2, TRUE, $3, $4, $5, $6)`,
            [
                synthetic,
                normalizeCatalogValue(nombreExcel) || nombreExcel,
                correoNorm,
                cliente || null,
                lider || null,
                gpId
            ]
        );
        if (!byFold.has(nombreFold)) byFold.set(nombreFold, []);
        byFold.get(nombreFold).push({
            cedula: synthetic,
            nombre: normalizeCatalogValue(nombreExcel) || nombreExcel,
            correo_cinte: correoNorm,
            cliente: cliente || null,
            lider_catalogo: lider || null
        });
        inserted += 1;
        notas.push('origen_IMPORT_SINTETICO');
        reportLines.push(
            [
                rowIndex,
                escapeCsvField(nombreExcel),
                'insertado',
                escapeCsvField(synthetic),
                'si',
                escapeCsvField(correoNorm || ''),
                escapeCsvField(cliente),
                escapeCsvField(lider),
                gpId ? 'si' : 'no',
                emailUserMatch ? 'si' : 'no',
                parOk ? 'si' : 'no',
                escapeCsvField(notas.join(';'))
            ].join(',')
        );
    }

    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
    await pool.end();

    console.log('Listo.', { updated, inserted, merged, ambiguous, skipped, informe: reportPath });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
