require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
});

async function expireActa() {
    try {
        const res = await pool.query(`
            SELECT id, cliente, finalizado_at 
            FROM seguimiento_acta 
            WHERE tipo = 'consultor' AND estado = 'FINALIZADO'
            ORDER BY created_at DESC
            LIMIT 1
        `);
        
        if (res.rows.length === 0) {
            console.log('No se encontraron actas finalizadas.');
            return;
        }
        
        const actaId = res.rows[0].id;
        console.log(`Acta seleccionada: ${actaId} (Cliente: ${res.rows[0].cliente})`);
        
        await pool.query(`
            UPDATE seguimiento_acta 
            SET finalizado_at = NOW() - INTERVAL '4 days' 
            WHERE id = $1
        `, [actaId]);
        
        console.log('✅ Acta actualizada a 4 días de antigüedad para simular vencimiento.');
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

expireActa();
