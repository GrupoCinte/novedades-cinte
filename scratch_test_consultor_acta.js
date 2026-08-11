const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

async function test() {
    const actasRes = await pool.query(`
        SELECT a.id, a.estado, a.payload_json
        FROM seguimiento_acta a 
        WHERE a.tipo = 'consultor'
    `);
    
    console.log(`Found ${actasRes.rowCount} actas`);
    for (let r of actasRes.rows) {
        console.log(`\nActa ID: ${r.id}`);
        console.log(`Estado: ${r.estado}`);
        console.log(`Payload keys:`, Object.keys(r.payload_json));
        console.log(`Payload stringified:`, JSON.stringify(r.payload_json, null, 2));
    }

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
