require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});
const { v4: uuidv4 } = require('uuid');

async function run() {
    try {
        console.log("=== Preparando datos de prueba reales para Reubicaciones ===");
        
        // 1. Limpiar datos de pruebas anteriores
        await pool.query(`DELETE FROM reubicaciones_source_events WHERE source_event_id LIKE 'ZOHO-TEST-%'`);
        await pool.query(`DELETE FROM reubicaciones_pipeline WHERE ultimo_evento_id LIKE 'ZOHO-TEST-%'`);
        await pool.query(`DELETE FROM ficha_novedades_staging WHERE external_id LIKE 'ZOHO-TEST-%'`);
        await pool.query(`DELETE FROM colaborador_contratos WHERE cedula IN ('990000001', '990000002')`);
        await pool.query(`DELETE FROM colaboradores WHERE cedula IN ('990000001', '990000002')`);
        
        // 2. Crear Caso 1: SALIDA
        console.log("Creando Caso 1: Salida (Cedula: 990000001)...");
        await pool.query(`
            INSERT INTO colaboradores (cedula, nombre, cliente, activo, fecha_termino) 
            VALUES ('990000001', 'Consultor Salida Real', 'CLIENTE TEST', TRUE, '2026-12-31')
        `);
        // Para salida, insertamos en staging directamente
        await pool.query(`
            INSERT INTO ficha_novedades_staging (
                id, received_at, created_at, cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                tipo_novedad, status, payload_normalizado, external_id
            ) VALUES (
                $1, NOW(), NOW(), '990000001', '990000001', 'Consultor Salida Real',
                'salida', 'pendiente', $2, 'ZOHO-TEST-SALIDA-REAL-01'
            )
        `, [
            uuidv4(), 
            JSON.stringify({ 
                cedula: '990000001', 
                fecha_termino: '2026-12-31', 
                cliente: 'CLIENTE TEST' 
            })
        ]);

        // 3. Crear Caso 2: EXTENSIÓN
        console.log("Creando Caso 2: Extensión (Cedula: 990000002)...");
        await pool.query(`
            INSERT INTO colaboradores (cedula, nombre, cliente, activo, fecha_termino) 
            VALUES ('990000002', 'Consultor Extension Real', 'CLIENTE TEST', TRUE, '2026-10-01')
        `);
        // Para extensión, es OBLIGATORIO que exista un contrato vigente con ese cliente en colaborador_contratos
        await pool.query(`
            INSERT INTO colaborador_contratos (cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino, vigente, es_cabecera, origen)
            VALUES ('990000002', 'CLIENTE TEST', 'obra_labor', '2025-01-01', '2026-10-01', TRUE, FALSE, 'seed_test')
        `);
        
        // Novedad de extensión, moviendo la fecha de 2026-10-01 a 2026-12-31
        await pool.query(`
            INSERT INTO ficha_novedades_staging (
                id, received_at, created_at, cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                tipo_novedad, status, payload_normalizado, external_id
            ) VALUES (
                $1, NOW(), NOW(), '990000002', '990000002', 'Consultor Extension Real',
                'extension', 'pendiente', $2, 'ZOHO-TEST-EXT-REAL-01'
            )
        `, [
            uuidv4(), 
            JSON.stringify({ 
                cedula: '990000002', 
                fecha_termino: '2026-12-31', 
                cliente: 'CLIENTE TEST' 
            })
        ]);

        console.log("=== Datos insertados correctamente ===");
        console.log("Ya puedes entrar a la UI a probar.");
    } catch (e) {
        console.error("Error insertando datos:", e);
    } finally {
        pool.end();
    }
}

run();
