#!/usr/bin/env node
/**
 * Batch one-shot: normaliza a MAYÚSCULAS nombre, cliente, puesto y cargo Cinte en colaboradores.
 *
 * Uso:
 *   node scripts/ch-uppercase-batch.mjs           # dry-run (solo conteo)
 *   node scripts/ch-uppercase-batch.mjs --apply   # ejecuta UPDATE
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');

const COUNT_SQL = `
SELECT COUNT(*)::int AS total
FROM colaboradores
WHERE
  (nombre IS NOT NULL AND TRIM(nombre) <> '' AND nombre <> UPPER(TRIM(nombre)))
  OR (cliente IS NOT NULL AND TRIM(cliente) <> '' AND cliente <> UPPER(TRIM(cliente)))
  OR (puesto IS NOT NULL AND TRIM(puesto) <> '' AND puesto <> UPPER(TRIM(puesto)))
  OR (descriptivo_puesto_sig IS NOT NULL AND TRIM(descriptivo_puesto_sig) <> '' AND descriptivo_puesto_sig <> UPPER(TRIM(descriptivo_puesto_sig)))
`;

const UPDATE_SQL = `
UPDATE colaboradores SET
  nombre = CASE WHEN nombre IS NOT NULL AND TRIM(nombre) <> '' THEN UPPER(TRIM(nombre)) ELSE nombre END,
  cliente = CASE WHEN cliente IS NOT NULL AND TRIM(cliente) <> '' THEN UPPER(TRIM(cliente)) ELSE cliente END,
  puesto = CASE WHEN puesto IS NOT NULL AND TRIM(puesto) <> '' THEN UPPER(TRIM(puesto)) ELSE puesto END,
  descriptivo_puesto_sig = CASE WHEN descriptivo_puesto_sig IS NOT NULL AND TRIM(descriptivo_puesto_sig) <> '' THEN UPPER(TRIM(descriptivo_puesto_sig)) ELSE descriptivo_puesto_sig END,
  updated_at = NOW()
WHERE
  (nombre IS NOT NULL AND TRIM(nombre) <> '' AND nombre <> UPPER(TRIM(nombre)))
  OR (cliente IS NOT NULL AND TRIM(cliente) <> '' AND cliente <> UPPER(TRIM(cliente)))
  OR (puesto IS NOT NULL AND TRIM(puesto) <> '' AND puesto <> UPPER(TRIM(puesto)))
  OR (descriptivo_puesto_sig IS NOT NULL AND TRIM(descriptivo_puesto_sig) <> '' AND descriptivo_puesto_sig <> UPPER(TRIM(descriptivo_puesto_sig)))
`;

async function main() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    try {
        const countRes = await pool.query(COUNT_SQL);
        const pending = countRes.rows[0]?.total ?? 0;
        console.log(`[ch-uppercase-batch] Filas a normalizar: ${pending}`);
        if (!APPLY) {
            console.log('[ch-uppercase-batch] Dry-run. Pasa --apply para ejecutar el UPDATE.');
            return;
        }
        const upd = await pool.query(UPDATE_SQL);
        console.log(`[ch-uppercase-batch] UPDATE aplicado. rowCount=${upd.rowCount ?? pending}`);
    } finally {
        await pool.end();
    }
}

main().catch((e) => {
    console.error('[ch-uppercase-batch] Error:', e.message);
    process.exit(1);
});
