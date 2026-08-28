require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function run() {
    try {
        const res = await pool.query(`
            SELECT id, cedula_detectada, colaborador_cedula_match, tipo_novedad, status
            FROM ficha_novedades_staging
            WHERE external_id LIKE 'ZOHO-TEST-%'
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
run();
