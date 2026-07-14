'use strict';

const { isoDate, monthBounds, resolveTarifaBaseMes } = require('./conciliacionTarifaProrrateo');

/**
 * @param {import('pg').Pool} pool
 * @param {string} cedula
 * @param {string} cliente
 * @param {number} tarifa
 * @param {string} vigenteDesde ISO date
 * @param {{ source?: string, stagingId?: string }} meta
 */
async function insertTarifaHistorial(pool, cedula, cliente, tarifa, vigenteDesde, meta = {}) {
    const ced = String(cedula || '').replace(/\D/g, '');
    const cli = String(cliente || '').trim();
    const desde = isoDate(vigenteDesde);
    const t = Math.round(Number(tarifa) || 0);
    if (!ced || !cli || !desde || t <= 0) return null;

    await pool.query(
        `UPDATE colaborador_tarifa_historial
         SET vigente_hasta = ($3::date - INTERVAL '1 day')::date
         WHERE cedula = $1 AND lower(btrim(cliente)) = lower(btrim($2))
           AND vigente_hasta IS NULL
           AND vigente_desde < $3::date`,
        [ced, cli, desde]
    );

    const q = await pool.query(
        `INSERT INTO colaborador_tarifa_historial (
            cedula, cliente, tarifa, vigente_desde, source, staging_id
         ) VALUES ($1, $2, $3, $4::date, $5, $6::uuid)
         RETURNING id, vigente_desde, tarifa`,
        [ced, cli, t, desde, meta.source || null, meta.stagingId || null]
    );
    return q.rows[0] || null;
}

/**
 * Tramos de tarifa que intersectan el mes de facturación.
 * @returns {Promise<Array<{ tarifa: number, vigente_desde: string, vigente_hasta: string|null }>>}
 */
async function fetchTarifaHistorialTramosMes(pool, cedula, cliente, year, month) {
    const ced = String(cedula || '').replace(/\D/g, '');
    const cli = String(cliente || '').trim();
    if (!ced || !cli) return [];
    const { periodStart, periodEnd } = monthBounds(year, month);

    const q = await pool.query(
        `SELECT tarifa, vigente_desde, vigente_hasta
         FROM colaborador_tarifa_historial
         WHERE cedula = $1
           AND lower(btrim(cliente)) = lower(btrim($2))
           AND vigente_desde <= $4::date
           AND (vigente_hasta IS NULL OR vigente_hasta >= $3::date)
         ORDER BY vigente_desde ASC`,
        [ced, cli, periodStart, periodEnd]
    );

    return (q.rows || []).map((r) => ({
        tarifa: Number(r.tarifa) || 0,
        vigente_desde: isoDate(r.vigente_desde),
        vigente_hasta: r.vigente_hasta ? isoDate(r.vigente_hasta) : null
    }));
}

/**
 * Batch: historial por cédula para un cliente y mes.
 * @returns {Promise<Map<string, Array>>}
 */
async function fetchTarifaHistorialTramosMesBatch(pool, cedulas, cliente, year, month) {
    const map = new Map();
    const list = (Array.isArray(cedulas) ? cedulas : []).filter(Boolean);
    if (!list.length) return map;
    const cli = String(cliente || '').trim();
    const { periodStart, periodEnd } = monthBounds(year, month);

    const q = await pool.query(
        `SELECT cedula, tarifa, vigente_desde, vigente_hasta
         FROM colaborador_tarifa_historial
         WHERE cedula = ANY($1::text[])
           AND lower(btrim(cliente)) = lower(btrim($2))
           AND vigente_desde <= $4::date
           AND (vigente_hasta IS NULL OR vigente_hasta >= $3::date)
         ORDER BY cedula, vigente_desde ASC`,
        [list, cli, periodStart, periodEnd]
    );

    for (const r of q.rows || []) {
        const ced = String(r.cedula || '').replace(/\D/g, '');
        if (!ced) continue;
        if (!map.has(ced)) map.set(ced, []);
        map.get(ced).push({
            tarifa: Number(r.tarifa) || 0,
            vigente_desde: isoDate(r.vigente_desde),
            vigente_hasta: r.vigente_hasta ? isoDate(r.vigente_hasta) : null
        });
    }
    return map;
}

/**
 * Tarifa vigente al último día del mes (fallback maestro).
 */
async function resolveTarifaVigenteFinMes(pool, cedula, cliente, year, month, tarifaMaestro) {
    const tramos = await fetchTarifaHistorialTramosMes(pool, cedula, cliente, year, month);
    if (!tramos.length) return Math.round(Number(tarifaMaestro) || 0);
    const { periodEnd } = monthBounds(year, month);
    let best = null;
    for (const t of tramos) {
        const desde = isoDate(t.vigente_desde);
        const hasta = t.vigente_hasta ? isoDate(t.vigente_hasta) : periodEnd;
        if (desde <= periodEnd && hasta >= periodEnd) {
            best = t;
        }
    }
    if (best) return Math.round(Number(best.tarifa) || 0);
    const last = tramos[tramos.length - 1];
    return Math.round(Number(last?.tarifa) || Number(tarifaMaestro) || 0);
}

function buildTarifaMesFromContext(ctx, tarifaMaestro, tramos, billingOpts) {
    return resolveTarifaBaseMes({
        tarifaMaestro,
        year: ctx.year,
        month: ctx.month,
        fechaIngreso: ctx.fechaIngreso,
        fechaTermino: ctx.fechaTermino,
        fechaBajaEfectiva: ctx.fechaBajaEfectiva,
        billingMode: billingOpts.billingMode,
        baseHours: billingOpts.baseHours,
        tramos: tramos && tramos.length ? tramos : null
    });
}

module.exports = {
    insertTarifaHistorial,
    fetchTarifaHistorialTramosMes,
    fetchTarifaHistorialTramosMesBatch,
    resolveTarifaVigenteFinMes,
    buildTarifaMesFromContext
};
