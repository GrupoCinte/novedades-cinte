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
        console.log("=== Columns of ficha_novedades_staging ===");
        const fns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ficha_novedades_staging'`);
        console.log(fns.rows);
        
        console.log("\n=== Columns of colaboradores ===");
        const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'colaboradores'`);
        console.log(cols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
run();
