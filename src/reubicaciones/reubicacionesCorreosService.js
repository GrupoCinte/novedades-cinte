// src/reubicaciones/reubicacionesCorreosService.js

const { diasHabilesTranscurridos } = require('./reubicacionesCalendario');

async function procesarCorreosReubicacion({ pool, emailPublisher }) {
    console.log('[Correos] Procesando correos de reubicación...');

    try {
        const casos = await pool.query(`
            SELECT 
                rp.id,
                rp.cedula,
                rp.fecha_fin,
                rp.estado,
                rp.cliente_destino,
                c.nombre as consultor_nombre,
                c.cliente as cliente_actual,
                u.email as gp_email,
                u.full_name as gp_nombre
            FROM reubicaciones_pipeline rp
            JOIN colaboradores c ON rp.cedula = c.cedula
            LEFT JOIN users u ON c.gp_user_id = u.id
            WHERE rp.estado IN ('En proceso', 'Pendiente')
              AND rp.fecha_fin IS NOT NULL
        `);

        if (casos.rows.length === 0) {
            console.log('[Correos] No hay casos activos para procesar.');
            return 0;
        }

        let correosEnviados = 0;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        for (const caso of casos.rows) {
            const fechaFin = new Date(caso.fecha_fin);
            fechaFin.setHours(0, 0, 0, 0);

            const diasHabiles = await diasHabilesTranscurridos(fechaFin, hoy);  
            console.log(`🔍 fechaFin: ${fechaFin}, hoy: ${hoy}, diasHabiles: ${diasHabiles}`);


            let hito = null;
            if (diasHabiles === 0) hito = 'dia_0';
            else if (diasHabiles === 3) hito = 'dia_3';
            else if (diasHabiles === 5) hito = 'dia_5';

            if (!hito) continue;

            const yaEnviado = await pool.query(`
                SELECT 1 FROM alertas_correo_control 
                WHERE caso_id = $1 AND hito = $2 AND enviado = true
            `, [caso.id, hito]);

            if (yaEnviado.rows.length > 0) {
                console.log(`[Correos] Caso ${caso.id} - ${hito} ya enviado.`);
                continue;
            }

            const destinatarios = await pool.query(`
                SELECT DISTINCT email FROM users 
                WHERE role IN ('gp', 'atraccion_talento', 'super_admin')
                  AND email IS NOT NULL
                  AND email != ''
            `);
            const emails = destinatarios.rows.map(u => u.email).filter(Boolean);

            if (caso.gp_email && !emails.includes(caso.gp_email)) {
                emails.push(caso.gp_email);
            }

            if (emails.length === 0) {
                console.warn(`[Correos] Sin destinatarios para caso ${caso.id}`);
                continue;
            }

            try {
                const { randomUUID } = require('crypto');
                
                if (emailPublisher && typeof emailPublisher.publishReubicacionAlerta === 'function') {
                    await emailPublisher.publishReubicacionAlerta({
                        eventId: randomUUID(),
                        occurredAt: new Date().toISOString(),
                        casoId: caso.id,
                        consultor: {
                            nombre: caso.consultor_nombre,
                            cedula: caso.cedula
                        },
                        hito: hito,
                        fechaFin: caso.fecha_fin,
                        diasRestantes: diasHabiles,
                        estado: caso.estado,
                        clienteActual: caso.cliente_actual,
                        clienteDestino: caso.cliente_destino,
                        gp: {
                            nombre: caso.gp_nombre,
                            email: caso.gp_email
                        },
                        destinatarios: emails,
                        meta: {
                            source: 'reubicaciones_worker',
                            env: process.env.NODE_ENV || 'development'
                        }
                    });
                }

                await pool.query(`
                    INSERT INTO alertas_correo_control (caso_id, hito, enviado, fecha_envio)
                    VALUES ($1, $2, true, NOW())
                    ON CONFLICT (caso_id, hito) DO UPDATE 
                    SET enviado = true, fecha_envio = NOW(), updated_at = NOW()
                `, [caso.id, hito]);

                correosEnviados++;
                console.log(`[Correos] Alerta ${hito} enviada para caso ${caso.id}`);
            } catch (error) {
                console.error(`[Correos] Error publicando alerta para caso ${caso.id}:`, error);
            }
        }

        console.log(`[Correos] ${correosEnviados} correos enviados.`);
        return correosEnviados;
    } catch (error) {
        console.error('[Correos] Error procesando correos:', error);
        throw error;
    }
}

module.exports = { procesarCorreosReubicacion }; 