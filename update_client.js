require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'novedades_cinte',
    port: process.env.DB_PORT || 5432
});

async function main() {
    try {
        const res = await pool.query("UPDATE colaboradores SET cliente = 'Experian' WHERE cedula = '90003'");
        console.log('✅ Cliente Experian asignado a Michael Fonseca. Filas afectadas:', res.rowCount);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
main();
