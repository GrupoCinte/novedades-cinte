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
        const { rows: users } = await pool.query(`SELECT id, email, role FROM users LIMIT 2`);
        console.table(users);
        
        // Simulating the backend actor id lookup
        const email = 'mfonseca@grupocinte.com'; // My email
        const { rows: findUser } = await pool.query(`SELECT id, role FROM users WHERE email = $1`, [email]);
        console.table(findUser);
    } catch (e) {
        console.error("Error db:", e);
    } finally {
        pool.end();
    }
}
runTest();
