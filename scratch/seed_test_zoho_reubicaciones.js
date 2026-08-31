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
        console.log("=== Corrigiendo datos de prueba ===");
        
        // Delete the old broken data
        await pool.query(`DELETE FROM ficha_novedades_staging WHERE external_id LIKE 'ZOHO-TEST-%'`);
        await pool.query(`DELETE FROM colaboradores WHERE cedula IN ('TEST-SALIDA-01', 'TEST-EXT-01', 'TEST-RECHAZO-01')`);
        
        const testUsers = [
            { cedula: '990000001', nombre: 'Consultor Test Salida', term: '2026-12-31' },
            { cedula: '990000002', nombre: 'Consultor Test Extension', term: '2026-10-01' },
            { cedula: '990000003', nombre: 'Consultor Test Rechazo', term: '2026-12-31' }
        ];

        // 1. Crear usuarios en colaboradores
        for (const u of testUsers) {
            await pool.query(`
                INSERT INTO colaboradores (cedula, nombre, cliente, activo, fecha_termino) 
                VALUES ($1, $2, 'CLIENTE DEMO', TRUE, $3)
                ON CONFLICT (cedula) DO UPDATE SET nombre=EXCLUDED.nombre, activo=TRUE, fecha_termino=EXCLUDED.fecha_termino
            `, [u.cedula, u.nombre, u.term]);
        }

        console.log("Nuevos colaboradores de prueba insertados.");

        // 2. Crear Novedades Zoho en staging
        const novedades = [
            {
                cedula: '990000001',
                tipo: 'salida',
                fecha: '2026-12-31',
                ext_id: 'ZOHO-TEST-SALIDA-001'
            },
            {
                cedula: '990000002',
                tipo: 'salida',
                fecha: '2026-10-01',
                ext_id: 'ZOHO-TEST-EXT-INIT-001'
            },
            {
                cedula: '990000002',
                tipo: 'extension',
                fecha: '2026-11-30',
                ext_id: 'ZOHO-TEST-EXT-001'
            },
            {
                cedula: '990000003',
                tipo: 'salida',
                fecha: '2026-12-31',
                ext_id: 'ZOHO-TEST-RECHAZO-001'
            }
        ];

        for (const n of novedades) {
            await pool.query(`
                INSERT INTO ficha_novedades_staging (
                    id, received_at, created_at, cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                    tipo_novedad, status, payload_normalizado, external_id
                ) VALUES (
                    $1, NOW(), NOW(), $2, $2, (SELECT nombre FROM colaboradores WHERE cedula = $2),
                    $3, 'pendiente', $4, $5
                )
            `, [
                uuidv4(), n.cedula, n.tipo, JSON.stringify({ cedula: n.cedula, fecha_termino: n.fecha, cliente: 'CLIENTE DEMO' }), n.ext_id
            ]);
        }
        
        console.log("Nuevas novedades insertadas correctamente en staging.");
        console.log("=== Datos corregidos ===");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
