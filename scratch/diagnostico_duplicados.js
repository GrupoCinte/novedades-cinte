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
        console.log("=== Duplicados en reubicaciones_decisiones ===");
        const dups = await pool.query(`SELECT pipeline_id, count(*) as count FROM reubicaciones_decisiones GROUP BY pipeline_id HAVING count(*) > 1`);
        console.log(dups.rows);

        console.log("\n=== Constraints de reubicaciones_decisiones ===");
        const constr = await pool.query(`SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'reubicaciones_decisiones'`);
        console.log(constr.rows);

        console.log("\n=== Eventos en reubicaciones_historial ===");
        const hist = await pool.query(`SELECT count(*) FROM reubicaciones_historial WHERE tipo='decision_aptitud'`);
        console.log(hist.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
run();
