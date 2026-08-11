require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
});

async function runTest() {
    try {
        const { rows } = await pool.query(`
            SELECT h.id as historial_id, h.actor_user_id, u.email as user_email, h.actor_email 
            FROM seguimiento_historial h
            LEFT JOIN users u ON h.actor_user_id = u.id
            ORDER BY h.created_at DESC LIMIT 5
        `);
        console.log("Últimos registros en historial (verificando FK users.id):");
        console.table(rows);
    } catch (e) {
        console.error("Error db:", e);
    } finally {
        pool.end();
    }
}
runTest();
