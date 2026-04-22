/**
 * Lee colaboradores desde la BD del .env actual y genera SQL de upsert por cédula.
 * No incluye gp_user_id: en producción se conserva el existente (FK a users con UUIDs distintos).
 *
 * Uso: node scripts/export-colaboradores-upsert-sql.js [ruta-salida.sql]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function esc(s) {
    return String(s ?? '').replace(/'/g, "''");
}

function sqlText(val) {
    if (val === null || val === undefined || val === '') return 'NULL';
    return `'${esc(val)}'`;
}

async function main() {
    const outPath = path.resolve(process.argv[2] || 'colaboradores_upsert.sql');
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });
    const r = await pool.query(
        `SELECT cedula, nombre, activo, correo_cinte, cliente, lider_catalogo
         FROM colaboradores
         ORDER BY cedula ASC`
    );
    await pool.end();

    const lines = ['BEGIN;'];
    for (const row of r.rows) {
        const act = row.activo === false ? 'FALSE' : 'TRUE';
        lines.push(
            'INSERT INTO colaboradores (cedula, nombre, activo, correo_cinte, cliente, lider_catalogo) VALUES (' +
                `${sqlText(row.cedula)}, ${sqlText(row.nombre)}, ${act}, ` +
                `${sqlText(row.correo_cinte)}, ${sqlText(row.cliente)}, ${sqlText(row.lider_catalogo)}) ` +
                'ON CONFLICT (cedula) DO UPDATE SET ' +
                'nombre = EXCLUDED.nombre, ' +
                'activo = EXCLUDED.activo, ' +
                'correo_cinte = EXCLUDED.correo_cinte, ' +
                'cliente = EXCLUDED.cliente, ' +
                'lider_catalogo = EXCLUDED.lider_catalogo, ' +
                'updated_at = NOW();'
        );
    }
    lines.push('COMMIT;');
    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
    console.log(`Escrito ${r.rows.length} filas en ${outPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
