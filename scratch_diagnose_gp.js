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
    console.log("Fetching the latest FINALIZADO acta of type consultor...");
    const actasRes = await pool.query(`
        SELECT a.id, a.estado, a.payload_json, a.fecha_acta, a.compromisos, a.observaciones, a.updated_at
        FROM seguimiento_acta a 
        WHERE a.tipo = 'consultor' AND UPPER(a.estado) = 'FINALIZADO'
        ORDER BY a.updated_at DESC
        LIMIT 1
    `);
    
    if (actasRes.rowCount === 0) {
        console.log("No actas found");
        process.exit(0);
    }

    const acta = actasRes.rows[0];
    console.log(`\nActa ID: ${acta.id}`);
    console.log(`Estado: ${acta.estado}`);
    console.log(`Fecha Acta: ${acta.fecha_acta}`);
    console.log(`Updated At: ${acta.updated_at}`);
    console.log(`Compromisos: ${acta.compromisos}`);
    console.log(`Observaciones: ${acta.observaciones}`);
    console.log(`Payload keys:`, Object.keys(acta.payload_json || {}));
    console.log(`Payload stringified:`, JSON.stringify(acta.payload_json, null, 2));

    const partsRes = await pool.query(
        `SELECT rol, cedula, email, nombre FROM seguimiento_participante WHERE acta_id = $1 ORDER BY rol, nombre`,
        [acta.id]
    );
    console.log(`\nParticipantes:`, JSON.stringify(partsRes.rows, null, 2));

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
