require('dotenv').config();
const { Pool } = require('pg');
const { createSeguimientoConsultorService } = require('./src/seguimiento/seguimientoConsultorService');
const { createSeguimientoService } = require('./src/seguimiento/seguimientoService');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
});

async function runTests() {
    console.log('Iniciando Pruebas AUT-287...\n');
    
    const consultorService = createSeguimientoConsultorService({ pool });
    const gpService = createSeguimientoService({ pool });

    let actaId;
    
    try {
        // Preparar GP de prueba
        const gpRes = await pool.query(`SELECT id, email FROM users WHERE role = 'gp' LIMIT 1`);
        if (gpRes.rows.length === 0) throw new Error('No hay GP en DB');
        const gp = gpRes.rows[0];

        const actor = { id: gp.id, email: gp.email, role: 'gp' };

        console.log('--- CASO A/I: GP crea y finaliza acta ---');
        // Crear acta Borrador
        const createRes = await gpService.createActa({
            gp_id: gp.id,
            cliente: 'Cliente Test AUT-287',
            estado: 'Borrador',
            fecha_acta: new Date().toISOString().split('T')[0],
            tipo: 'consultor',
            correo_cierre_estado: 'no_aplica',
            payload_json: { objetivo: 'Prueba de observaciones' }
        }, actor);
        actaId = createRes.id;
        console.log('✅ Acta Borrador Creada:', actaId);
        
        // Finalizar acta (Simulando updateActa del GP)
        await gpService.updateActa(actaId, {
            estado: 'FINALIZADO',
            cliente: 'Cliente Test AUT-287',
            tipo: 'consultor',
            fecha_acta: new Date().toISOString().split('T')[0],
            participantes: [
                { nombre: 'Consultor 1', rol: 'consultor', email: 'consultor1@test.com', cedula: '1111' },
                { nombre: 'Consultor 2', rol: 'consultor', email: 'consultor2@test.com', cedula: '2222' }
            ],
            payload_json: { 
                objetivo: 'Prueba de observaciones',
                hora_inicio: '08:00',
                hora_fin: '09:00',
                agenda: 'Punto 1',
                planes_accion: [{ tarea: 'T1' }]
            }
        }, actor);
        
        const actaDb = await pool.query(`SELECT finalizado_at FROM seguimiento_acta WHERE id = $1`, [actaId]);
        if (!actaDb.rows[0].finalizado_at) throw new Error('finalizado_at no se configuró');
        console.log('✅ Acta Finalizada. finalizado_at configurado:', actaDb.rows[0].finalizado_at);

        console.log('\n--- CASO D: Consultor guarda observación ---');
        await consultorService.addObservacionConsultor({
            id: actaId,
            email: 'consultor1@test.com',
            cedula: '1111',
            observacion: 'Primera observación'
        });
        const obs1 = await pool.query(`SELECT observacion FROM seguimiento_participante WHERE acta_id = $1 AND email = 'consultor1@test.com'`, [actaId]);
        if (obs1.rows[0].observacion !== 'Primera observación') throw new Error('Observación no guardada');
        console.log('✅ Observación guardada exitosamente.');

        console.log('\n--- CASO E: Consultor modifica observación antes de 72h ---');
        await consultorService.addObservacionConsultor({
            id: actaId,
            email: 'consultor1@test.com',
            cedula: '1111',
            observacion: 'Observación Modificada'
        });
        const obs2 = await pool.query(`SELECT observacion FROM seguimiento_participante WHERE acta_id = $1 AND email = 'consultor1@test.com'`, [actaId]);
        if (obs2.rows[0].observacion !== 'Observación Modificada') throw new Error('Observación no modificada');
        console.log('✅ Observación modificada exitosamente.');

        console.log('\n--- CASO H: Consultor 2 intenta editar observación (No es posible cruzarse) ---');
        await consultorService.addObservacionConsultor({
            id: actaId,
            email: 'consultor2@test.com',
            cedula: '2222',
            observacion: 'Obs de C2'
        });
        const obsC2 = await pool.query(`SELECT observacion FROM seguimiento_participante WHERE acta_id = $1 AND email = 'consultor2@test.com'`, [actaId]);
        if (obsC2.rows[0].observacion !== 'Obs de C2') throw new Error('Error al guardar C2');
        console.log('✅ Aislamiento correcto: cada consultor guarda en su propia fila.');

        console.log('\n--- CASO G: Backend rechaza llamada directa post 72h ---');
        // Forzamos la BD para simular que pasaron más de 72 horas (4 días)
        await pool.query(`UPDATE seguimiento_acta SET finalizado_at = NOW() - INTERVAL '4 days' WHERE id = $1`, [actaId]);
        
        let rejectSuccess = false;
        try {
            await consultorService.addObservacionConsultor({
                id: actaId,
                email: 'consultor1@test.com',
                cedula: '1111',
                observacion: 'Intento extemporáneo'
            });
        } catch (error) {
            if (error.message.includes('plazo de 72 horas')) {
                rejectSuccess = true;
            } else {
                throw error;
            }
        }
        if (!rejectSuccess) throw new Error('Backend permitió guardar después de 72 horas!');
        console.log('✅ Backend bloqueó correctamente el guardado (Ventana expirada).');

        console.log('\n🎉 TODAS LAS PRUEBAS BACKEND COMPLETADAS EXITOSAMENTE 🎉');
    } catch (e) {
        console.error('❌ ERROR DURANTE LAS PRUEBAS:', e.message);
        console.error(e.stack);
    } finally {
        if (actaId) {
            await pool.query('DELETE FROM seguimiento_acta WHERE id = $1', [actaId]);
            console.log('🧹 Limpieza de BD completada.');
        }
        pool.end();
    }
}

runTests();
