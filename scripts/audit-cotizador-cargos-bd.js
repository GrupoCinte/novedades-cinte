/**
 * Auditoría: muestra si existen cargos por cliente en cotizador_catalogos (clave cargos_por_cliente).
 * Uso: node scripts/audit-cotizador-cargos-bd.js
 */
require('dotenv').config({ override: true });
const { Pool } = require('pg');

const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
if (!DB_PASSWORD) {
    console.error('Falta DB_PASSWORD en .env (mismo entorno que el servidor).');
    process.exit(1);
}

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'cinte_app',
    password: DB_PASSWORD
});

async function main() {
    const table = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'cotizador_catalogos'
        ) AS ok
    `);
    console.log('Tabla cotizador_catalogos existe:', table.rows[0]?.ok);

    const row = await pool.query(
        `SELECT key, payload, updated_at FROM cotizador_catalogos WHERE key = 'cargos_por_cliente'`
    );
    if (row.rowCount === 0) {
        console.log('\nRESULTADO: No hay fila key=cargos_por_cliente. El import nunca se ejecutó o falló.');
        await pool.end();
        return;
    }

    const payload = row.rows[0].payload;
    const raw = typeof payload === 'object' && payload !== null ? payload : {};
    const keys = Object.keys(raw).filter((k) => Array.isArray(raw[k]));
    console.log('\nÚltima actualización:', row.rows[0].updated_at);
    console.log('Clientes con clave en cargos_por_cliente:', keys.length);
    for (const k of keys.slice(0, 25)) {
        console.log(`  - "${k}": ${raw[k].length} cargo(s)`);
    }
    if (keys.length > 25) console.log(`  ... y ${keys.length - 25} más`);

    const cli = await pool.query(
        `SELECT COUNT(DISTINCT cliente)::int AS n FROM clientes_lideres WHERE activo = TRUE`
    );
    console.log('\nClientes distintos en clientes_lideres (activos):', cli.rows[0]?.n);

    await pool.end();
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
