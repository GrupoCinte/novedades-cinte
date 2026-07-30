'use strict';

/**
 * AUT-586 — one-shot: recalcula tope dominical para cédulas donde una HE Rechazada
 * pudo haber consumido cupo junto a Pendiente/Aprobado.
 *
 * Uso (contenedor backend con DATABASE_URL):
 *   node scripts/aut-586-remediate-domingo-rechazadas.js --dry-run
 *   node scripts/aut-586-remediate-domingo-rechazadas.js
 */

const { Pool } = require('pg');
const festivosService = require('../src/festivosService');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const { collectRecargoDayKeysInInterval } = require('../src/heBogotaSplit');
const { recomputeAndPersistDomingoRecargoGroup } = require('../src/heDomingoRecargoGroup');

const dryRun = process.argv.includes('--dry-run');

async function main() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL es obligatorio');
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const festivosSet = await festivosService.getFestivosSet();

        const q = await pool.query(
            `SELECT id, cedula, fecha_inicio, fecha_fin, hora_inicio, hora_fin
             FROM novedades
             WHERE lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\\s+', ' ', 'g')) = 'hora extra'
               AND estado = 'Rechazado'::novedad_estado
               AND fecha_inicio IS NOT NULL
               AND fecha_fin IS NOT NULL
               AND hora_inicio IS NOT NULL
               AND hora_fin IS NOT NULL
             ORDER BY cedula, fecha_inicio
             LIMIT 5000`
        );

        /** @type {Map<string, Set<string>>} */
        const byCedula = new Map();
        for (const row of q.rows || []) {
            const ced = String(row.cedula || '').trim();
            if (!ced) continue;
            const startMs = toUtcMsFromDateAndTime(row.fecha_inicio, row.hora_inicio);
            const endMs = toUtcMsFromDateAndTime(row.fecha_fin, row.hora_fin);
            const keys = collectRecargoDayKeysInInterval(startMs, endMs, festivosSet);
            if (!keys.length) continue;
            if (!byCedula.has(ced)) byCedula.set(ced, new Set());
            for (const k of keys) byCedula.get(ced).add(k);
        }

        console.log(
            JSON.stringify(
                {
                    dryRun,
                    rejectedHeScanned: (q.rows || []).length,
                    cedulasAfectadas: byCedula.size
                },
                null,
                2
            )
        );

        let totalUpdated = 0;
        for (const [cedula, daySet] of byCedula) {
            const dayKeys = [...daySet].sort();
            if (dryRun) {
                console.log(JSON.stringify({ cedula, dayKeys, action: 'skip-dry-run' }));
                continue;
            }
            const result = await recomputeAndPersistDomingoRecargoGroup(pool, cedula, dayKeys, festivosSet);
            totalUpdated += result.updated || 0;
            console.log(JSON.stringify({ cedula, dayKeys, updated: result.updated }));
        }

        console.log(JSON.stringify({ ok: true, totalUpdated, dryRun }));
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
