/**
 * Actualiza novedades importadas con scripts/import-vacaciones-produccion-xlsx.js:
 * - estado según columna "Estado vacación" del Excel (hoja Produccion)
 * - Si está Aprobado: aprobado_en, aprobado_por_email, aprobado_por_user_id, aprobado_por_rol desde un usuario BD
 *
 * Uso:
 *   node scripts/update-vacaciones-import-estados-aprobador.js <ruta.xlsx> [--approver-email correo@dominio.com] [--dry-run|--apply]
 *
 * Por defecto --approver-email lcastaneda@grupocinte.com
 * Solo toca filas con soporte_ruta = migrated:vacaciones-produccion-xlsx y tipo Vacaciones en tiempo.
 */
require('dotenv').config();
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const { normalizeCedula, normalizeEstado, parseDateOrNull } = require('../src/utils');

const TIPO = 'Vacaciones en tiempo';
const SOPORTE_MARKER = 'migrated:vacaciones-produccion-xlsx';
const SHEET = 'Produccion';
const DEFAULT_APPROVER = 'lcastaneda@grupocinte.com';

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = { xlsxPath: '', dryRun: true, approverEmail: DEFAULT_APPROVER };
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--apply') out.dryRun = false;
        else if (a === '--approver-email') {
            out.approverEmail = String(args[i + 1] || '').trim().toLowerCase();
            i += 1;
        } else if (!a.startsWith('-') && !out.xlsxPath) out.xlsxPath = path.resolve(a);
    }
    return out;
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
    return parseDateOrNull(String(cell).trim());
}

async function main() {
    const opts = parseArgs(process.argv);
    if (!opts.xlsxPath) {
        console.error(
            'Uso: node scripts/update-vacaciones-import-estados-aprobador.js <archivo.xlsx> [--approver-email email] [--dry-run|--apply]'
        );
        process.exit(1);
    }

    const wb = xlsx.readFile(opts.xlsxPath);
    if (!wb.SheetNames.includes(SHEET)) {
        console.error('No se encontró la hoja', SHEET);
        process.exit(1);
    }
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[SHEET], { defval: '', raw: false });

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const em = opts.approverEmail;
    const uq = await pool.query(
        `SELECT id::text AS id, role::text AS role FROM users WHERE lower(btrim(email)) = lower(btrim($1)) LIMIT 1`,
        [em]
    );
    const approver = uq.rows[0];
    if (!approver) {
        console.warn(
            `[WARN] No hay usuario en BD con email "${em}". Se actualizará solo aprobado_por_email; user_id y rol quedarán NULL para filas Aprobadas.`
        );
    }

    const report = { updated: 0, notFound: [], errors: [] };

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const line = i + 2;
        const cedula = normalizeCedula(row.Empleado ?? row.empleado ?? '');
        const fi = cellToDateString(row['Fecha inicial']);
        const ff = cellToDateString(row['Fecha final']);
        const estadoExcel = row['Estado vacación'] ?? row['Estado vacacion'] ?? '';
        if (!cedula || !fi || !ff) continue;

        const estado = normalizeEstado(estadoExcel);
        const uid = approver?.id || null;
        const rol = approver?.role || null;

        const find = await pool.query(
            `SELECT id FROM novedades
             WHERE cedula = $1
               AND tipo_novedad = $2
               AND fecha_inicio = $3::date
               AND fecha_fin = $4::date
               AND soporte_ruta = $5
             LIMIT 2`,
            [cedula, TIPO, fi, ff, SOPORTE_MARKER]
        );
        if (find.rows.length === 0) {
            report.notFound.push({ line, cedula, fi, ff, estado });
            continue;
        }
        if (find.rows.length > 1) {
            report.errors.push({ line, cedula, reason: 'Múltiples coincidencias en BD' });
            continue;
        }
        const id = find.rows[0].id;

        if (opts.dryRun) {
            report.updated += 1;
            continue;
        }

        if (estado === 'Aprobado') {
            if (approver) {
                await pool.query(
                    `UPDATE novedades SET
                        estado = 'Aprobado'::novedad_estado,
                        aprobado_en = NOW(),
                        aprobado_por_email = $2,
                        aprobado_por_user_id = $3::uuid,
                        aprobado_por_rol = $4::user_role,
                        rechazado_en = NULL,
                        rechazado_por_user_id = NULL,
                        rechazado_por_rol = NULL,
                        rechazado_por_email = NULL,
                        updated_at = NOW()
                     WHERE id = $1::uuid`,
                    [id, em, uid, rol]
                );
            } else {
                await pool.query(
                    `UPDATE novedades SET
                        estado = 'Aprobado'::novedad_estado,
                        aprobado_en = NOW(),
                        aprobado_por_email = $2,
                        aprobado_por_user_id = NULL,
                        aprobado_por_rol = NULL,
                        rechazado_en = NULL,
                        rechazado_por_user_id = NULL,
                        rechazado_por_rol = NULL,
                        rechazado_por_email = NULL,
                        updated_at = NOW()
                     WHERE id = $1::uuid`,
                    [id, em]
                );
            }
        } else if (estado === 'Rechazado') {
            if (approver) {
                await pool.query(
                    `UPDATE novedades SET
                        estado = 'Rechazado'::novedad_estado,
                        rechazado_en = NOW(),
                        rechazado_por_email = $2,
                        rechazado_por_user_id = $3::uuid,
                        rechazado_por_rol = $4::user_role,
                        aprobado_en = NULL,
                        aprobado_por_user_id = NULL,
                        aprobado_por_rol = NULL,
                        aprobado_por_email = NULL,
                        updated_at = NOW()
                     WHERE id = $1::uuid`,
                    [id, em, uid, rol]
                );
            } else {
                await pool.query(
                    `UPDATE novedades SET
                        estado = 'Rechazado'::novedad_estado,
                        rechazado_en = NOW(),
                        rechazado_por_email = $2,
                        rechazado_por_user_id = NULL,
                        rechazado_por_rol = NULL,
                        aprobado_en = NULL,
                        aprobado_por_user_id = NULL,
                        aprobado_por_rol = NULL,
                        aprobado_por_email = NULL,
                        updated_at = NOW()
                     WHERE id = $1::uuid`,
                    [id, em]
                );
            }
        } else {
            await pool.query(
                `UPDATE novedades SET
                    estado = 'Pendiente'::novedad_estado,
                    aprobado_en = NULL,
                    aprobado_por_user_id = NULL,
                    aprobado_por_rol = NULL,
                    aprobado_por_email = NULL,
                    rechazado_en = NULL,
                    rechazado_por_user_id = NULL,
                    rechazado_por_rol = NULL,
                    rechazado_por_email = NULL,
                    updated_at = NOW()
                 WHERE id = $1::uuid`,
                [id]
            );
        }
        report.updated += 1;
    }

    console.log('Modo:', opts.dryRun ? '--dry-run' : '--apply');
    console.log('Aprobador (email):', em);
    console.log('Usuario BD:', approver ? `${approver.id} (${approver.role})` : 'no encontrado');
    console.log('Filas Excel con cédula+fechas:', rows.filter((r) => normalizeCedula(r.Empleado)).length);
    console.log(opts.dryRun ? 'Simuladas (coincidencias):' : 'Actualizadas:', report.updated);
    if (report.notFound.length) {
        console.log('Sin coincidencia en BD (primeras 15):', JSON.stringify(report.notFound.slice(0, 15), null, 2));
    }
    if (report.errors.length) console.log('Errores:', report.errors);

    await pool.end();
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
