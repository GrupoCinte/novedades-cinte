/**
 * Uso: node -r dotenv/config scripts/check-colaboradores-directorio.js
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const c = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    await c.connect();
    const total = await c.query('SELECT COUNT(*)::int AS n FROM colaboradores WHERE activo = TRUE');
    const conCorreo = await c.query(
        `SELECT COUNT(*)::int AS n FROM colaboradores
         WHERE activo = TRUE AND correo_cinte IS NOT NULL AND btrim(correo_cinte) <> ''`
    );
    const conCliente = await c.query(
        `SELECT COUNT(*)::int AS n FROM colaboradores
         WHERE activo = TRUE AND cliente IS NOT NULL AND btrim(cliente) <> ''`
    );
    const muestra = await c.query(
        `SELECT cedula, nombre,
                left(coalesce(correo_cinte, ''), 40) AS correo_prev,
                left(coalesce(cliente, ''), 30) AS cliente_prev
         FROM colaboradores WHERE activo = TRUE LIMIT 5`
    );
    await c.end();
    console.log(
        JSON.stringify(
            {
                totalActivos: total.rows[0].n,
                conCorreoCinte: conCorreo.rows[0].n,
                conCliente: conCliente.rows[0].n,
                muestra5: muestra.rows
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
