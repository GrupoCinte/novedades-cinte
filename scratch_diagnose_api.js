const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

const { createSeguimientoConsultorService } = require('./src/seguimiento/seguimientoConsultorService.js');

async function test() {
    const srv = createSeguimientoConsultorService({ pool });
    const actaId = "31fd7ec5-f583-455d-a3f2-68580b4e7cb8";
    const cedula = "90003";
    const email = "mfonseca@grupocinte.com";

    console.log(`Calling getActaConsultor for ${actaId}, ${cedula}, ${email}...`);
    const acta = await srv.getActaConsultor({ id: actaId, cedula, email });
    
    if (!acta) {
        console.log("Returned null!");
    } else {
        console.log("Returned acta.");
        console.log("payload_json is:", typeof acta.payload_json);
        console.log("Keys:", Object.keys(acta.payload_json || {}));
        console.log("hora_inicio:", acta.payload_json.hora_inicio);
    }
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
