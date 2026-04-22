/**
 * Lee clientes_lideres desde la BD del .env actual y genera SQL de upsert
 * (ON CONFLICT cliente+líder) sin tocar gp_user_id en filas existentes.
 *
 * Uso: node scripts/export-clientes-lideres-upsert-sql.js [ruta-salida.sql]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function esc(s) {
    return String(s ?? '').replace(/'/g, "''");
}

async function main() {
    const outPath = path.resolve(process.argv[2] || 'clientes_lideres_upsert.sql');
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });
    const r = await pool.query(
        'SELECT cliente, lider, activo FROM clientes_lideres ORDER BY cliente ASC, lider ASC'
    );
    await pool.end();

    const lines = ['BEGIN;'];
    for (const row of r.rows) {
        const act = row.activo === false ? 'FALSE' : 'TRUE';
        lines.push(
            `INSERT INTO clientes_lideres (cliente, lider, activo) VALUES ('${esc(row.cliente)}', '${esc(row.lider)}', ${act}) ` +
                'ON CONFLICT (cliente, lider) DO UPDATE SET activo = EXCLUDED.activo, updated_at = NOW();'
        );
    }
    lines.push('COMMIT;');
    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
    console.log(`Escrito ${r.rows.length} sentencias en ${outPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
