/**
 * Importa novedades "Vacaciones en tiempo" desde la hoja Produccion de un Excel.
 * Hoja Hoja1 se ignora por diseño.
 *
 * Uso:
 *   node scripts/import-vacaciones-produccion-xlsx.js <ruta.xlsx> [--map scripts/vacaciones-import-centro-a-cliente.csv] [--dry-run|--apply]
 *   --dry-run   (default) valida y muestra resumen sin INSERT
 *   --apply     ejecuta INSERT (transacción por lote)
 *   --estado pendiente|excel   pendiente = siempre Pendiente; excel = usa columna Estado vacación
 *
 * Requiere .env con DB_* apuntando al entorno (desarrollo).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const { foldForMatch } = require('../src/cotizador/clienteNombreMatch');
const { normalizeCedula, normalizeCatalogValue, normalizeEstado, parseDateOrNull } = require('../src/utils');
const { inferAreaFromNovedad } = require('../src/rbac');

/** Copia de la lógica en registerRoutes (vacaciones en tiempo); script de importación única. */
function parseDateAtUtcStart(value) {
    if (!value) return null;
    const dateValue = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(dateValue.getTime())) return null;
    return dateValue;
}

function countBusinessDaysInclusive(startDateRaw, endDateRaw) {
    const start = parseDateAtUtcStart(startDateRaw);
    const end = parseDateAtUtcStart(endDateRaw);
    if (!start || !end || end < start) return 0;
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6) count += 1;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
}

const TIPO_NOVEDAD = 'Vacaciones en tiempo';
const SHEET = 'Produccion';

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = {
        xlsxPath: '',
        mapPath: path.join(__dirname, 'vacaciones-import-centro-a-cliente.csv'),
        dryRun: true,
        estadoMode: 'pendiente'
    };
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--apply') out.dryRun = false;
        else if (a === '--map') {
            out.mapPath = path.resolve(args[i + 1] || '');
            i += 1;
        } else if (a === '--estado') {
            out.estadoMode = String(args[i + 1] || 'pendiente').toLowerCase();
            i += 1;
        } else if (!a.startsWith('-') && !out.xlsxPath) out.xlsxPath = path.resolve(a);
    }
    return out;
}

function loadCentroMap(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const map = new Map();
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const idx = t.indexOf(',');
        if (idx <= 0) continue;
        const key = normalizeCatalogValue(t.slice(0, idx));
        const val = normalizeCatalogValue(t.slice(idx + 1));
        if (key.toLowerCase() === 'centro_de_costo' && val.toLowerCase() === 'cliente') continue;
        if (key && val) map.set(foldForMatch(key), val);
    }
    return map;
}

/** Prioriza mapeo Excel centro→cliente canónico; si no hay entrada, usa cliente del directorio. */
function resolveClienteForRow(centroRaw, colCliente, centroMap) {
    const centro = normalizeCatalogValue(centroRaw);
    if (centro) {
        const mapped = centroMap.get(foldForMatch(centro));
        if (mapped) return mapped;
    }
    return normalizeCatalogValue(colCliente);
}

async function liderValidoParaCliente(pool, cliente, lider) {
    const c = normalizeCatalogValue(cliente);
    const l = normalizeCatalogValue(lider);
    if (!c || !l) return false;
    const r = await pool.query(
        `SELECT lider FROM clientes_lideres WHERE activo = TRUE AND cliente = $1`,
        [c]
    );
    const lf = foldForMatch(l);
    return (r.rows || []).some((row) => foldForMatch(row.lider) === lf);
}

async function duplicateExists(conn, cedula, fi, ff) {
    const r = await conn.query(
        `SELECT 1 FROM novedades
         WHERE cedula = $1 AND tipo_novedad = $2 AND fecha_inicio = $3::date AND (fecha_fin IS NOT DISTINCT FROM $4::date)
         LIMIT 1`,
        [cedula, TIPO_NOVEDAD, fi, ff || null]
    );
    return r.rows.length > 0;
}

function excelSerialToIso(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    const utc = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function cellToDateString(cell) {
    if (cell == null || cell === '') return null;
    if (typeof cell === 'number') return excelSerialToIso(cell);
    const s = String(cell).trim();
    const parsed = parseDateOrNull(s);
    return parsed;
}

async function main() {
    const opts = parseArgs(process.argv);
    if (!opts.xlsxPath || !fs.existsSync(opts.xlsxPath)) {
        console.error(
            'Uso: node scripts/import-vacaciones-produccion-xlsx.js <archivo.xlsx> [--map ruta.csv] [--dry-run|--apply] [--estado pendiente|excel]'
        );
        process.exit(1);
    }
    if (!fs.existsSync(opts.mapPath)) {
        console.error('No existe archivo de mapeo:', opts.mapPath);
        process.exit(1);
    }
    const centroMap = loadCentroMap(opts.mapPath);

    const wb = xlsx.readFile(opts.xlsxPath);
    if (!wb.SheetNames.includes(SHEET)) {
        console.error('No se encontró la hoja', SHEET, 'en el libro. Hojas:', wb.SheetNames.join(', '));
        process.exit(1);
    }
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[SHEET], { defval: '', raw: false });
    if (!Array.isArray(rows) || rows.length === 0) {
        console.error('La hoja Produccion está vacía.');
        process.exit(1);
    }

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const report = {
        ok: [],
        errors: [],
        diasMismatch: [],
        skippedDuplicate: [],
        liderFromCatalogFallback: []
    };

    const resolved = [];

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const lineNum = i + 2;
        const cedula = normalizeCedula(row.Empleado ?? row.empleado ?? '');
        const centroCosto = row['Descripción centro de costo'] ?? row['Descripcion centro de costo'] ?? '';
        const fi = cellToDateString(row['Fecha inicial']);
        const ff = cellToDateString(row['Fecha final']);
        const diasExcel = Number(String(row['Dias programados'] ?? '').replace(',', '.')) || 0;
        const estadoExcel = row['Estado vacación'] ?? row['Estado vacacion'] ?? '';

        if (!cedula) {
            report.errors.push({ line: lineNum, reason: 'Cédula vacía o inválida', row });
            continue;
        }
        if (!fi || !ff) {
            report.errors.push({ line: lineNum, reason: 'Fecha inicial o final inválida', row });
            continue;
        }
        if (ff < fi) {
            report.errors.push({ line: lineNum, reason: 'Fecha final menor que inicial', row });
            continue;
        }

        const colQ = await pool.query(
            `SELECT cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id
             FROM colaboradores WHERE cedula = $1 LIMIT 1`,
            [cedula]
        );
        const col = colQ.rows[0];
        if (!col) {
            report.errors.push({ line: lineNum, reason: `Colaborador no encontrado en directorio (${cedula})`, row });
            continue;
        }
        if (col.activo === false) {
            report.errors.push({ line: lineNum, reason: `Colaborador inactivo (${cedula})`, row });
            continue;
        }

        const cliente = resolveClienteForRow(centroCosto, col.cliente, centroMap);
        let lider = normalizeCatalogValue(col.lider_catalogo);
        if (!cliente) {
            report.errors.push({
                line: lineNum,
                reason: 'Cliente vacío: complete directorio o mapeo centro→cliente',
                centro: String(centroCosto).trim(),
                cedula
            });
            continue;
        }
        async function pickFirstCatalogLider() {
            const pick = await pool.query(
                `SELECT lider FROM clientes_lideres WHERE activo = TRUE AND cliente = $1 ORDER BY lider ASC LIMIT 1`,
                [cliente]
            );
            return normalizeCatalogValue(pick.rows[0]?.lider || '');
        }

        if (!lider) {
            lider = await pickFirstCatalogLider();
            if (lider) {
                report.liderFromCatalogFallback.push({ line: lineNum, cedula, cliente, lider, reason: 'sin_lider_catalogo' });
            }
        }
        if (lider) {
            const okL = await liderValidoParaCliente(pool, cliente, lider);
            if (!okL) {
                const picked = await pickFirstCatalogLider();
                if (picked && foldForMatch(picked) !== foldForMatch(lider)) {
                    report.liderFromCatalogFallback.push({
                        line: lineNum,
                        cedula,
                        cliente,
                        anterior: lider,
                        lider: picked,
                        reason: 'lider_catalogo_no_valido_para_cliente'
                    });
                    lider = picked;
                } else if (!picked) {
                    lider = '';
                }
            }
        }
        if (!lider) {
            report.errors.push({
                line: lineNum,
                reason: 'Sin líder válido para el cliente en clientes_lideres',
                cliente,
                cedula
            });
            continue;
        }

        const businessDays = countBusinessDaysInclusive(fi, ff);
        if (businessDays <= 0) {
            report.errors.push({
                line: lineNum,
                reason: 'Rango sin días hábiles (misma regla que API vacaciones en tiempo)',
                fi,
                ff
            });
            continue;
        }

        if (Number.isFinite(diasExcel) && diasExcel > 0 && Math.abs(diasExcel - businessDays) > 0.001) {
            report.diasMismatch.push({
                line: lineNum,
                cedula,
                fi,
                ff,
                diasProgramadosExcel: diasExcel,
                diasHabilesCalculados: businessDays
            });
        }

        let estado = 'Pendiente';
        if (opts.estadoMode === 'excel') {
            estado = normalizeEstado(estadoExcel);
        }

        const area = inferAreaFromNovedad({ tipoNovedad: TIPO_NOVEDAD });
        const nombre = normalizeCatalogValue(col.nombre) || normalizeCatalogValue(row['Nombre empleado']);
        const correo = normalizeCatalogValue(col.correo_cinte);
        const soporteRuta = 'migrated:vacaciones-produccion-xlsx';

        const rec = {
            line: lineNum,
            cedula,
            nombre,
            correo_solicitante: correo || null,
            cliente,
            lider,
            gp_user_id: col.gp_user_id || null,
            fecha_inicio: fi,
            fecha_fin: ff,
            cantidad_horas: businessDays,
            estado,
            area,
            soporte_ruta: soporteRuta
        };
        resolved.push(rec);
        report.ok.push({ line: lineNum, cedula, cliente, fi, ff, cantidad_horas: businessDays, estado });
    }

    console.log('--- Resumen ---');
    console.log('Filas Excel:', rows.length);
    console.log('Resueltas OK:', report.ok.length);
    console.log('Errores:', report.errors.length);
    console.log('Discrepancia días (Excel vs hábiles):', report.diasMismatch.length);
    console.log('Líder tomado solo del catálogo (sin lider_catalogo):', report.liderFromCatalogFallback.length);
    if (report.diasMismatch.length) {
        console.log('\nDiscrepancias (primeras 15):');
        console.log(JSON.stringify(report.diasMismatch.slice(0, 15), null, 2));
    }
    if (report.errors.length) {
        console.log('\nErrores (primeras 20):');
        console.log(JSON.stringify(report.errors.slice(0, 20), null, 2));
    }

    if (opts.dryRun) {
        console.log('\nModo --dry-run: no se insertó nada.');
        if (report.errors.length) {
            console.log('(Hay filas con error; corregir directorio/mapeo antes de --apply si se requiere el 100%.)');
        }
        await pool.end();
        process.exit(0);
    }

    const client = await pool.connect();
    let inserted = 0;
    try {
        await client.query('BEGIN');
        const insertSql = `
                INSERT INTO novedades (
                    nombre, cedula, correo_solicitante, cliente, lider, gp_user_id, tipo_novedad, area,
                    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
                    cantidad_horas, horas_diurnas, horas_nocturnas,
                    horas_recargo_domingo, horas_recargo_domingo_diurnas, horas_recargo_domingo_nocturnas,
                    tipo_hora_extra, soporte_ruta, monto_cop, estado,
                    aprobado_en, aprobado_por_email
                ) VALUES (
                    $1, $2, $3, $4, $5, $6::uuid, $7, $8::user_area,
                    NULL, NULL, NULL, $9::date, $10::date,
                    $11, 0, 0, 0, 0, 0, NULL, $12, NULL, $13::novedad_estado,
                    $14, $15
                )`;

        for (const rec of resolved) {
            if (await duplicateExists(client, rec.cedula, rec.fecha_inicio, rec.fecha_fin)) {
                report.skippedDuplicate.push({ cedula: rec.cedula, fi: rec.fecha_inicio, ff: rec.fecha_fin });
                continue;
            }

            const apEn = rec.estado === 'Aprobado' ? new Date() : null;
            const apEm = rec.estado === 'Aprobado' ? 'import@vacaciones-produccion' : null;
            const correo = rec.correo_solicitante ? String(rec.correo_solicitante).trim() : null;

            await client.query(insertSql, [
                rec.nombre,
                rec.cedula,
                correo,
                rec.cliente,
                rec.lider,
                rec.gp_user_id,
                TIPO_NOVEDAD,
                rec.area,
                rec.fecha_inicio,
                rec.fecha_fin,
                rec.cantidad_horas,
                rec.soporte_ruta,
                rec.estado,
                apEn,
                apEm
            ]);
            inserted += 1;
        }
        await client.query('COMMIT');
        console.log('\n--- Apply ---');
        console.log('Insertadas:', inserted);
        console.log('Omitidas (duplicado cédula+fechas+tipo):', report.skippedDuplicate.length);
        if (report.skippedDuplicate.length) {
            console.log(JSON.stringify(report.skippedDuplicate.slice(0, 20), null, 2));
        }
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('ROLLBACK:', e.message);
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
