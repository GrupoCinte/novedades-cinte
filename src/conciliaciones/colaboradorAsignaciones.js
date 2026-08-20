'use strict';

const { resolveClienteOnWrite } = require('../clientes/clienteCanonWrite');

/**
 * Asignaciones simultáneas colaborador ↔ cliente (multi-cliente).
 */

function normalizeCedula(value) {
    return String(value || '').replace(/\D/g, '');
}

function normalizeCliente(value) {
    return String(value || '').trim();
}

/**
 * @param {import('pg').Pool} pool
 */
async function upsertColaboradorAsignacion(pool, {
    cedula,
    cliente,
    tarifa,
    fechaInicio,
    fechaFin,
    codigoZoho,
    activo = true
}) {
    const ced = normalizeCedula(cedula);
    const cli = resolveClienteOnWrite(normalizeCliente(cliente));
    if (!ced || !cli) return null;
    const t = tarifa != null && Number.isFinite(Number(tarifa)) ? Math.round(Number(tarifa)) : 0;

    const q = await pool.query(
        `INSERT INTO colaborador_asignaciones (
            cedula, cliente, tarifa, fecha_inicio, fecha_fin, codigo_zoho, activo
         ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7)
         ON CONFLICT (cedula, cliente) DO UPDATE SET
            tarifa = EXCLUDED.tarifa,
            fecha_inicio = COALESCE(EXCLUDED.fecha_inicio, colaborador_asignaciones.fecha_inicio),
            fecha_fin = EXCLUDED.fecha_fin,
            codigo_zoho = COALESCE(EXCLUDED.codigo_zoho, colaborador_asignaciones.codigo_zoho),
            activo = EXCLUDED.activo,
            updated_at = NOW()
         RETURNING *`,
        [ced, cli, t, fechaInicio || null, fechaFin || null, codigoZoho || null, activo !== false]
    );
    return q.rows[0] || null;
}

async function getTarifaAsignacion(pool, cedula, cliente) {
    const ced = normalizeCedula(cedula);
    const cli = normalizeCliente(cliente);
    if (!ced || !cli) return null;
    const q = await pool.query(
        `SELECT tarifa, fecha_inicio, fecha_fin, activo
         FROM colaborador_asignaciones
         WHERE cedula = $1 AND lower(btrim(cliente)) = lower(btrim($2))
         LIMIT 1`,
        [ced, cli]
    );
    return q.rows[0] || null;
}

/**
 * @returns {Promise<Map<string, number>>} cedula → tarifa
 */
async function fetchTarifasAsignacionBatch(pool, cedulas, cliente) {
    const map = new Map();
    const list = (Array.isArray(cedulas) ? cedulas : []).map(normalizeCedula).filter(Boolean);
    const cli = normalizeCliente(cliente);
    if (!list.length || !cli) return map;

    const q = await pool.query(
        `SELECT cedula, tarifa
         FROM colaborador_asignaciones
         WHERE cedula = ANY($1::text[])
           AND lower(btrim(cliente)) = lower(btrim($2))
           AND activo IS NOT FALSE`,
        [list, cli]
    );
    for (const r of q.rows || []) {
        map.set(normalizeCedula(r.cedula), Number(r.tarifa) || 0);
    }
    return map;
}

async function listAsignacionesByCedula(pool, cedula) {
    const ced = normalizeCedula(cedula);
    if (!ced) return [];
    const q = await pool.query(
        `SELECT id, cedula, cliente, tarifa, fecha_inicio, fecha_fin, codigo_zoho, activo
         FROM colaborador_asignaciones
         WHERE cedula = $1
         ORDER BY activo DESC, cliente ASC`,
        [ced]
    );
    return q.rows || [];
}

/**
 * Migra filas existentes de colaboradores → asignaciones (idempotente).
 */
async function migrateColaboradoresToAsignaciones(pool) {
    await pool.query(`
        INSERT INTO colaborador_asignaciones (cedula, cliente, tarifa, fecha_inicio, activo)
        SELECT c.cedula, btrim(c.cliente), COALESCE(c.tarifa_cliente, 0), c.fecha_ingreso, COALESCE(c.activo, true)
        FROM colaboradores c
        WHERE btrim(COALESCE(c.cliente, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM colaborador_asignaciones a
            WHERE a.cedula = c.cedula
              AND lower(btrim(a.cliente)) = lower(btrim(c.cliente))
          )
    `);
}

module.exports = {
    upsertColaboradorAsignacion,
    getTarifaAsignacion,
    fetchTarifasAsignacionBatch,
    listAsignacionesByCedula,
    migrateColaboradoresToAsignaciones,
    normalizeCedula
};
