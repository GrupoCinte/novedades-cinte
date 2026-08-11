require('dotenv').config({ override: true });
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
        console.log('Creando esquema de AUT-284...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_acta (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                gp_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                cliente TEXT NOT NULL,
                fecha_acta DATE NOT NULL DEFAULT CURRENT_DATE,
                estado VARCHAR(50) NOT NULL DEFAULT 'Borrador',
                compromisos TEXT NULL,
                observaciones TEXT NULL,
                deleted_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE seguimiento_acta ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'consultor';
            ALTER TABLE seguimiento_acta ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE seguimiento_acta ADD COLUMN IF NOT EXISTS correo_cierre_estado TEXT NOT NULL DEFAULT 'no_aplica';
            ALTER TABLE seguimiento_acta ADD COLUMN IF NOT EXISTS finalizado_at TIMESTAMPTZ NULL;
            ALTER TABLE seguimiento_acta ADD COLUMN IF NOT EXISTS ciclo_vence_at DATE NULL;
            ALTER TABLE seguimiento_acta DROP COLUMN IF EXISTS consultor_cedula;

            CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_gp ON seguimiento_acta(gp_id);
            CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_cliente ON seguimiento_acta(cliente);
            CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_deleted ON seguimiento_acta(deleted_at) WHERE deleted_at IS NULL;

            CREATE TABLE IF NOT EXISTS seguimiento_participante (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
                nombre TEXT NOT NULL,
                rol VARCHAR(100) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                cedula TEXT NULL,
                email TEXT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_seguimiento_participante_acta ON seguimiento_participante(acta_id);

            CREATE TABLE IF NOT EXISTS seguimiento_historial (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
                accion VARCHAR(50) NOT NULL,
                estado_anterior VARCHAR(50) NULL,
                estado_nuevo VARCHAR(50) NULL,
                actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
                actor_email TEXT NOT NULL,
                actor_role VARCHAR(50) NOT NULL,
                detalle JSONB NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_seguimiento_historial_acta ON seguimiento_historial(acta_id);
        `);

        // Obtener al GP juan.gomez@cinte.com de la base de datos
        const userRes = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", ['juan.gomez@cinte.com']);
        if (userRes.rows.length === 0) {
            console.error("No se encontro a juan.gomez@cinte.com en la tabla users.");
            process.exit(1);
        }
        const gpId = userRes.rows[0].id;

        console.log('Limpiando actas previas...');
        await pool.query("DELETE FROM seguimiento_acta");

        console.log('Inyectando Escenarios para AUT-287...');
        // Consultor A: Michael Fonseca (mfonseca@grupocinte.com, 90003)
        const conACedula = '90003';
        const conAEmail = 'mfonseca@grupocinte.com';
        const conANombre = 'Michael Fonseca';
        
        // Consultor B: Laura Vargas (laura.vargas@cinte.com, 90002)
        const conBCedula = '90002';
        const conBEmail = 'laura.vargas@cinte.com';
        const conBNombre = 'Laura Vargas';

        // Escenario A: Acta consultor, finalizado (CA-01, CA-02) - DEBE VERLA
        const actaA = await pool.query(`
            INSERT INTO seguimiento_acta (gp_id, cliente, tipo, estado, finalizado_at, payload_json)
            VALUES ($1, 'Experian', 'consultor', 'finalizado', NOW(), '{"notas": "Escenario A: Todo OK"}')
            RETURNING id;
        `, [gpId]);
        await pool.query(`
            INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email)
            VALUES ($1, $2, 'consultor', $3, $4)
        `, [actaA.rows[0].id, conANombre, conACedula, conAEmail]);

        // Escenario B: Acta cliente, finalizado (CA-02) - NO DEBE VERLA
        const actaB = await pool.query(`
            INSERT INTO seguimiento_acta (gp_id, cliente, tipo, estado, finalizado_at, payload_json)
            VALUES ($1, 'Experian', 'cliente', 'finalizado', NOW(), '{"notas": "Escenario B: Es de cliente"}')
            RETURNING id;
        `, [gpId]);
        await pool.query(`
            INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email)
            VALUES ($1, $2, 'consultor', $3, $4)
        `, [actaB.rows[0].id, conANombre, conACedula, conAEmail]);

        // Escenario C: Acta consultor, borrador (CA-05) - NO DEBE VERLA
        const actaC = await pool.query(`
            INSERT INTO seguimiento_acta (gp_id, cliente, tipo, estado, finalizado_at, payload_json)
            VALUES ($1, 'Experian', 'consultor', 'borrador', NULL, '{"notas": "Escenario C: Borrador"}')
            RETURNING id;
        `, [gpId]);
        await pool.query(`
            INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email)
            VALUES ($1, $2, 'consultor', $3, $4)
        `, [actaC.rows[0].id, conANombre, conACedula, conAEmail]);

        // Escenario D: Acta consultor, finalizado PERO ELIMINADO (CA-05) - NO DEBE VERLA
        const actaD = await pool.query(`
            INSERT INTO seguimiento_acta (gp_id, cliente, tipo, estado, finalizado_at, deleted_at, payload_json)
            VALUES ($1, 'Experian', 'consultor', 'finalizado', NOW(), NOW(), '{"notas": "Escenario D: Eliminada"}')
            RETURNING id;
        `, [gpId]);
        await pool.query(`
            INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email)
            VALUES ($1, $2, 'consultor', $3, $4)
        `, [actaD.rows[0].id, conANombre, conACedula, conAEmail]);

        // Escenario E: Acta consultor, finalizado, asignada al Consultor B (CA-03) - NO DEBE VERLA (Michael Fonseca)
        const actaE = await pool.query(`
            INSERT INTO seguimiento_acta (gp_id, cliente, tipo, estado, finalizado_at, payload_json)
            VALUES ($1, 'Colsubsidio', 'consultor', 'finalizado', NOW(), '{"notas": "Escenario E: Acta de Laura"}')
            RETURNING id;
        `, [gpId]);
        await pool.query(`
            INSERT INTO seguimiento_participante (acta_id, nombre, rol, cedula, email)
            VALUES ($1, $2, 'consultor', $3, $4)
        `, [actaE.rows[0].id, conBNombre, conBCedula, conBEmail]);

        console.log('✅ Semilla de datos inyectada con éxito.');
        console.log('----------------------------------------------------');
        console.log('Consultor para pruebas: ' + conANombre);
        console.log(' - Cédula: ' + conACedula);
        console.log(' - Email: ' + conAEmail);
        console.log('Deberías ver SOLO UNA acta (Escenario A) al iniciar sesión con él.');

    } catch (err) {
        console.error('Error inyectando semilla:', err);
    } finally {
        await pool.end();
    }
}

main();
