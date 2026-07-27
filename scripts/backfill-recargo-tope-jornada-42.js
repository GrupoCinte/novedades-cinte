/**
 * AUT-575: recomputa HE con domingo/festivo dayKey >= 2026-07-15 (tope 7 h)
 * y actualiza textos de coeficiente 0,80→0,90 / 1,80→1,90 en observaciones
 * cuando el mes del domingo es >= 2026-07.
 *
 * Uso:
 *   node scripts/backfill-recargo-tope-jornada-42.js
 *   node scripts/backfill-recargo-tope-jornada-42.js --apply
 *   node scripts/backfill-recargo-tope-jornada-42.js --apply --skip-obs
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const { collectRecargoDayKeysInInterval } = require('../src/heBogotaSplit');
const { recomputeAndPersistDomingoRecargoGroup } = require('../src/heDomingoRecargoGroup');
const {
    buildSundayReportedSetsFromHeRows,
    computeHeDomingoObservacionForRow
} = require('../src/heDomingoBogota');
const {
    HE_DOMINGO_COMP_MARKER,
    buildConsultantKeyDefault
} = require('../src/heDomingoCompensacion');
const festivosService = require('../src/festivosService');

const CUTOFF_TOPE_YMD = '2026-07-15';
const APPLY = process.argv.includes('--apply');
const SKIP_OBS = process.argv.includes('--skip-obs');

function createPool() {
    const password = String(process.env.DB_PASSWORD || '').trim();
    if (!password) throw new Error('DB_PASSWORD es obligatorio.');
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password,
        max: 4
    });
}

/**
 * @param {string} oldObs
 * @param {string} policyText
 */
function mergePolicyPreservingCompMarker(oldObs, policyText) {
    const raw = String(oldObs || '');
    const policy = String(policyText || '').trim();
    const idx = raw.indexOf(HE_DOMINGO_COMP_MARKER);
    let compLine = '';
    if (idx >= 0) {
        compLine = raw.slice(idx).split(/\r?\n/)[0].trim();
    }
    const parts = [];
    if (compLine) parts.push(compLine);
    if (policy) parts.push(policy);
    return parts.join('\n');
}

async function main() {
    const pool = createPool();
    const festivosSet = await festivosService.getFestivosSet();
    const dep = { toUtcMsFromDateAndTime, festivosSet };

    console.log(`[backfill-aut-575] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} cutoff=${CUTOFF_TOPE_YMD}`);

    const q = await pool.query(
        `SELECT id, cedula, nombre, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
                malla_origen_ref, he_domingo_observacion, cantidad_horas,
                horas_recargo_domingo
         FROM novedades
         WHERE lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\\s+', ' ', 'g')) = 'hora extra'
           AND (
             fecha_inicio >= $1::date
             OR fecha_fin >= $1::date
             OR (fecha_inicio < $1::date AND COALESCE(fecha_fin, fecha_inicio) >= $1::date)
           )
         ORDER BY cedula, fecha_inicio, hora_inicio
         LIMIT 5000`,
        [CUTOFF_TOPE_YMD]
    );

    /** @type {Map<string, Set<string>>} */
    const byCedulaDays = new Map();
    let candidates = 0;

    for (const row of q.rows || []) {
        const startMs = toUtcMsFromDateAndTime(row.fecha_inicio, row.hora_inicio);
        const endMs = toUtcMsFromDateAndTime(row.fecha_fin, row.hora_fin);
        if (startMs == null || endMs == null || endMs <= startMs) continue;
        const keys = collectRecargoDayKeysInInterval(startMs, endMs, festivosSet).filter(
            (k) => k >= CUTOFF_TOPE_YMD
        );
        if (!keys.length) continue;
        candidates += 1;
        const ced = String(row.cedula || '').trim();
        if (!ced) continue;
        if (!byCedulaDays.has(ced)) byCedulaDays.set(ced, new Set());
        for (const k of keys) byCedulaDays.get(ced).add(k);
    }

    console.log(
        `[backfill-aut-575] filas HE con dayKey>=${CUTOFF_TOPE_YMD}: ${candidates}; cédulas: ${byCedulaDays.size}`
    );
    for (const [ced, days] of byCedulaDays) {
        console.log(`  cedula=${ced} days=${[...days].sort().join(',')}`);
    }

    let updatedRows = 0;
    if (APPLY) {
        for (const [ced, days] of byCedulaDays) {
            const r = await recomputeAndPersistDomingoRecargoGroup(pool, ced, [...days], festivosSet);
            updatedRows += r.updated;
            console.log(`  recompute cedula=${ced} updated=${r.updated}`);
        }
        console.log(`[backfill-aut-575] horas recomputadas: ${updatedRows} filas`);
    } else {
        console.log('[backfill-aut-575] dry-run: no se persistieron horas');
    }

    if (!SKIP_OBS) {
        const obsQ = await pool.query(
            `SELECT id, cedula, nombre, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
                    cantidad_horas, he_domingo_observacion
             FROM novedades
             WHERE lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\\s+', ' ', 'g')) = 'hora extra'
               AND he_domingo_observacion IS NOT NULL
               AND btrim(he_domingo_observacion) <> ''
               AND (
                 he_domingo_observacion LIKE '%0,80%'
                 OR he_domingo_observacion LIKE '%1,80%'
               )
               AND (
                 fecha_inicio >= '2026-07-01'::date
                 OR fecha_fin >= '2026-07-01'::date
               )
             ORDER BY cedula, fecha_inicio
             LIMIT 3000`
        );
        console.log(`[backfill-aut-575] observaciones con 0,80/1,80 (jul+): ${obsQ.rows.length}`);

        if (APPLY && obsQ.rows.length) {
            const allHeForPolicy = await pool.query(
                `SELECT id, cedula, nombre, fecha_inicio, fecha_fin, hora_inicio, hora_fin, cantidad_horas
                 FROM novedades
                 WHERE lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\\s+', ' ', 'g')) = 'hora extra'
                   AND (
                     fecha_inicio >= '2026-06-01'::date
                     OR fecha_fin >= '2026-06-01'::date
                   )
                 LIMIT 8000`
            );
            const sundaySets = buildSundayReportedSetsFromHeRows(
                allHeForPolicy.rows,
                buildConsultantKeyDefault,
                dep
            );
            let obsUpdated = 0;
            for (const row of obsQ.rows) {
                const policy = computeHeDomingoObservacionForRow(
                    row,
                    sundaySets,
                    buildConsultantKeyDefault,
                    dep
                );
                if (!policy || (!policy.includes('0,90') && !policy.includes('1,90'))) {
                    // fallback string replace si la política regenerada no aplica
                    let next = String(row.he_domingo_observacion || '');
                    next = next.replace(/coeficiente 0,80/g, 'coeficiente 0,90');
                    next = next.replace(/coeficiente 1,80/g, 'coeficiente 1,90');
                    if (next === row.he_domingo_observacion) continue;
                    await pool.query(`UPDATE novedades SET he_domingo_observacion = $2 WHERE id = $1::uuid`, [
                        row.id,
                        next
                    ]);
                    obsUpdated += 1;
                    continue;
                }
                const merged = mergePolicyPreservingCompMarker(row.he_domingo_observacion, policy);
                if (merged === String(row.he_domingo_observacion || '').trim()) continue;
                await pool.query(`UPDATE novedades SET he_domingo_observacion = $2 WHERE id = $1::uuid`, [
                    row.id,
                    merged
                ]);
                obsUpdated += 1;
            }
            console.log(`[backfill-aut-575] observaciones actualizadas: ${obsUpdated}`);
        } else if (!APPLY) {
            console.log('[backfill-aut-575] dry-run: no se persistieron observaciones');
        }
    }

    await pool.end();
    console.log('[backfill-aut-575] done');
}

main().catch((err) => {
    console.error('[backfill-aut-575] FATAL', err);
    process.exit(1);
});
