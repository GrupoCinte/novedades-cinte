/**
 * Importa cargos por cliente desde Excel a cotizador_catalogos (clave cargos_por_cliente).
 *
 * Formatos: hoja única con CLIENTE, o una hoja por cliente (PERFILES) con PERFIL / TARIFA ANTES DE IVA.
 * Alias hoja → cliente: tabla PostgreSQL cotizador_import_alias (semilla en cotizadorStore; editar con SQL).
 *
 * Uso: node scripts/import-cotizador-cargos-excel.js "C:\\ruta\\archivo.xlsx"
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const { createCotizadorStore } = require('../src/cotizador/cotizadorStore');
const { buildFoldToCanonicoMap, matchExcelClienteABd } = require('../src/cotizador/clienteNombreMatch');
const { calcularSsDinamico, calcularPrestacionesDinamico } = require('../src/cotizador/cotizadorEngine');

const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
if (!DB_PASSWORD) {
    console.error('FATAL: DB_PASSWORD es obligatorio.');
    process.exit(1);
}

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'cinte_app',
    password: DB_PASSWORD
});

function normCell(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

function normHojaKey(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normHeader(k) {
    return String(k || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function pickFlexible(row, mustInclude) {
    const inc = mustInclude.toLowerCase();
    for (const key of Object.keys(row)) {
        if (normHeader(key).includes(inc)) return row[key];
    }
    return '';
}

function pickRow(row, variants) {
    const keys = Object.keys(row);
    for (const want of variants) {
        const w = want.toLowerCase().replace(/\s+/g, '_');
        for (const k of keys) {
            if (k.toLowerCase().replace(/\s+/g, '_') === w) return row[k];
        }
    }
    return '';
}

function num(v) {
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

function findAliasRow(aliasRows, sheetName) {
    const k = normHojaKey(sheetName);
    for (const r of aliasRows) {
        if (normHojaKey(r.hoja_excel) === k) return r;
    }
    return null;
}

function rowToCargoClasico(row) {
    const cargo = normCell(pickRow(row, ['CARGO', 'cargo', 'Cargo']));
    if (!cargo) return null;
    return {
        cargo,
        salario: num(pickRow(row, ['SALARIO', 'salario'])),
        auxilios: num(pickRow(row, ['AUXILIOS', 'auxilios'])),
        plan_compl: num(pickRow(row, ['PLAN_COMPL', 'plan_compl', 'PLAN COMPL'])),
        aux_transporte: num(pickRow(row, ['AUX_TRANSPORTE', 'aux_transporte'])),
        ss: num(pickRow(row, ['SS', 'ss'])),
        prestaciones: num(pickRow(row, ['PRESTACIONES', 'prestaciones'])),
        equipo_tipo: String(normCell(pickRow(row, ['EQUIPO_TIPO', 'equipo_tipo', 'EQUIPO TIPO'])) || '1')
    };
}

function rowToCargoPerfiles(row, parametros, opts = {}) {
    const paisPref = opts.paisPrefix ? normCell(opts.paisPrefix) : '';
    const perfil = normCell(
        pickFlexible(row, 'perfil') || pickRow(row, ['PERFIL', 'Cargo', 'CARGO', 'cargo'])
    );
    if (!perfil) return null;
    const tarifa = num(
        pickFlexible(row, 'tarifa antes de iva') ||
            pickFlexible(row, 'tarifa') ||
            pickRow(row, ['SALARIO', 'salario', 'TARIFA'])
    );
    const smmlv = Number(parametros?.smmlv) || 1423500;
    const auxLeg = Number(parametros?.aux_transporte_legal) || 253000;
    const ss = calcularSsDinamico(tarifa, smmlv);
    const prestaciones = calcularPrestacionesDinamico(tarifa, smmlv, auxLeg);
    const cargoNombre = paisPref ? `${paisPref} - ${perfil}` : perfil;
    return {
        cargo: cargoNombre,
        salario: tarifa,
        auxilios: 0,
        plan_compl: 0,
        aux_transporte: tarifa <= smmlv * 2 ? auxLeg : 0,
        ss,
        prestaciones,
        equipo_tipo: '1'
    };
}

function esFormatoUnaHojaConCliente(rows) {
    if (!rows.length) return true;
    const k = Object.keys(rows[0]).map(normHeader);
    return k.some((x) => x.includes('cliente')) && k.some((x) => x === 'cargo' || x.includes('cargo'));
}

async function loadParametros(client) {
    const q = await client.query(`SELECT payload FROM cotizador_catalogos WHERE key = 'parametros' LIMIT 1`);
    return q.rows[0]?.payload || { smmlv: 1423500, aux_transporte_legal: 253000 };
}

async function ensureClienteLider(client, nombreCliente) {
    const n = normCell(nombreCliente);
    if (!n) return;
    await client.query(
        `INSERT INTO clientes_lideres (cliente, lider, activo)
         VALUES ($1, 'SIN ASIGNAR', TRUE)
         ON CONFLICT (cliente, lider)
         DO UPDATE SET activo = TRUE, updated_at = NOW()`,
        [n]
    );
}

/**
 * @param {Array<{hoja_excel:string, tipo:string, cliente:string, pais_directv:string|null}>} aliasRows
 * @returns {{ canon: string, paisPrefix: string|null }|null}
 */
function resolverHoja(sheetName, aliasRows, foldToCanonico) {
    const row = findAliasRow(aliasRows, sheetName);
    if (row) {
        if (row.tipo === 'CREAR') return { canon: row.cliente, paisPrefix: null };
        if (row.tipo === 'DIRECTV') return { canon: row.cliente, paisPrefix: row.pais_directv || null };
        return { canon: row.cliente, paisPrefix: null };
    }
    const canon = matchExcelClienteABd(normHojaKey(sheetName), foldToCanonico);
    if (!canon) return null;
    return { canon, paisPrefix: null };
}

async function main() {
    const excelPath = process.argv[2];
    if (!excelPath || !fs.existsSync(excelPath)) {
        console.error('Uso: node scripts/import-cotizador-cargos-excel.js <ruta-al.xlsx>');
        process.exit(1);
    }

    const cotizadorStore = createCotizadorStore({ pool, fs });
    await cotizadorStore.ensureReady();
    const aliasRows = await cotizadorStore.getImportAliases();
    const crearNombres = [...new Set(aliasRows.filter((r) => r.tipo === 'CREAR').map((r) => r.cliente))];
    crearNombres.forEach((n) => console.log('[cliente] Alta en clientes_lideres:', n));
    for (const n of crearNombres) await ensureClienteLider(pool, n);
    await ensureClienteLider(pool, 'DIRECTV');

    let clientesQ = await pool.query(
        `SELECT DISTINCT cliente
         FROM clientes_lideres
         WHERE activo = TRUE
         ORDER BY cliente ASC`
    );
    let listaBd = clientesQ.rows.map((r) => r.cliente).filter(Boolean);
    if (listaBd.length === 0) {
        console.error('No hay clientes activos en clientes_lideres.');
        process.exit(1);
    }

    let { map: foldToCanonico, warnings: mapWarnings } = buildFoldToCanonicoMap(listaBd);
    for (const w of mapWarnings) console.warn('[match]', w);

    const parametros = await loadParametros(pool);
    const wb = xlsx.readFile(excelPath);

    if (!wb.SheetNames?.length) {
        console.error('El Excel no tiene hojas.');
        process.exit(1);
    }

    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const firstRows = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });
    const usarHojaPorCliente = wb.SheetNames.length > 1 || !esFormatoUnaHojaConCliente(firstRows);

    /** @type {Record<string, Array>} */
    const acumulado = {};
    const sinMatchHojas = [];

    if (usarHojaPorCliente) {
        console.log(`Modo: una hoja por cliente (${wb.SheetNames.length} hojas).`);
        for (const sheetName of wb.SheetNames) {
            const resolved = resolverHoja(sheetName, aliasRows, foldToCanonico);
            if (!resolved) {
                sinMatchHojas.push(normHojaKey(sheetName));
                continue;
            }
            const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
            const cargos = [];
            for (const row of rows) {
                const c = rowToCargoPerfiles(row, parametros, { paisPrefix: resolved.paisPrefix || undefined });
                if (c) cargos.push(c);
            }
            if (cargos.length) {
                if (!acumulado[resolved.canon]) acumulado[resolved.canon] = [];
                acumulado[resolved.canon].push(...cargos);
            }
        }
    } else {
        console.log('Modo: una sola hoja con columna CLIENTE.');
        const sinMatch = [];
        for (const row of firstRows) {
            const clienteRaw = normCell(pickRow(row, ['CLIENTE', 'Cliente', 'cliente']));
            const cargoObj = rowToCargoClasico(row);
            if (!clienteRaw || !cargoObj) continue;
            const canon = matchExcelClienteABd(clienteRaw, foldToCanonico);
            if (!canon) {
                sinMatch.push(clienteRaw);
                continue;
            }
            if (!acumulado[canon]) acumulado[canon] = [];
            acumulado[canon].push(cargoObj);
        }
        const uniq = [...new Set(sinMatch)];
        if (uniq.length) {
            console.warn(`[match] CLIENTE sin correspondencia en BD (${uniq.length}):`);
            uniq.slice(0, 25).forEach((s) => console.warn(`  - "${s}"`));
        }
    }

    if (sinMatchHojas.length) {
        const u = [...new Set(sinMatchHojas)];
        console.warn(`[match] Hoja sin correspondencia (${u.length}):`);
        u.slice(0, 40).forEach((s) => console.warn(`  - "${s}"`));
    }

    const clientes = Object.keys(acumulado);
    if (clientes.length === 0) {
        console.error('No quedó ningún cargo importable.');
        process.exit(1);
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS cotizador_catalogos (
            key TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(
        `INSERT INTO cotizador_catalogos (key, payload, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        ['cargos_por_cliente', JSON.stringify(acumulado)]
    );

    console.log(`OK: cargos_por_cliente actualizado desde ${path.basename(excelPath)}`);
    console.log(`Clientes con cargos: ${clientes.length} — ${clientes.slice(0, 20).join(', ')}${clientes.length > 20 ? '…' : ''}`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
