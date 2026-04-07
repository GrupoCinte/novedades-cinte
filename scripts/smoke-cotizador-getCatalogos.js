/**
 * Simula un reinicio: llama getCatalogos() como el servidor y comprueba cargos_por_cliente.
 * Uso: node scripts/smoke-cotizador-getCatalogos.js
 */
require('dotenv').config({ override: true });
const { Pool } = require('pg');
const { createCotizadorStore } = require('../src/cotizador/cotizadorStore');

const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
if (!DB_PASSWORD) {
    console.error('Falta DB_PASSWORD en .env');
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
    const store = createCotizadorStore({ pool });
    const cat = await store.getCatalogos();
    const cpp = cat.cargos_por_cliente;
    const keys = Object.keys(cat).sort();
    console.log('getCatalogos() — claves devueltas:', keys.join(', '));
    if (cpp === undefined) {
        console.log('ERROR: cargos_por_cliente ausente en el objeto (no debería pasar tras ensure).');
        process.exitCode = 1;
    } else {
        const clientesConCargos = Object.keys(cpp || {}).filter(
            (k) => Array.isArray(cpp[k]) && cpp[k].length > 0
        );
        console.log('cargos_por_cliente: objeto presente, clientes con ≥1 cargo:', clientesConCargos.length);
        if (clientesConCargos.length > 0) {
            console.log('  Ejemplos:', clientesConCargos.slice(0, 5).join('; '));
        }
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
