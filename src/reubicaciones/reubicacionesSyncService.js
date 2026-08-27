const { normalizeCedula } = require('../utils');
const { calcularEstado } = require('./reubicacionesEstados');

function computeFields(normalized, patch) {
    const fecha_fin = normalized?.fecha_termino || patch?.fecha_termino;
    const cliente_destino = normalized?.cliente_destino || patch?.cliente_destino || normalized?.cliente || patch?.cliente;
    const causal = normalized?.causal || patch?.causal || normalized?.termino || patch?.termino;
    return { fecha_fin, cliente_destino, causal };
}

function esExtension(fechaAnterior, fechaNueva) {
    if (!fechaAnterior || !fechaNueva) return false;
    const anterior = new Date(fechaAnterior);
    anterior.setHours(0, 0, 0, 0);
    const nueva = new Date(fechaNueva);
    nueva.setHours(0, 0, 0, 0);
    return nueva > anterior;
}

async function generarAlertaExtension({
    pipeline_id,
    cedula,
    fecha_anterior,
    fecha_nueva,
    gp_user_id,
    gp_email,
    pool,
    notifyService
}) {
    const colab = await pool.query(
        `SELECT nombre, cliente FROM colaboradores WHERE cedula = $1`,
        [cedula]
    );
    const nombre = colab.rows[0]?.nombre || cedula;
    const cliente = colab.rows[0]?.cliente || 'N/A';

    const subject = `🔔 Extensión de reubicación - ${nombre}`;
    const body = `
Se ha detectado una extensión en la fecha de término del consultor.

📋 Datos del caso:
- Consultor: ${nombre} (${cedula})
- Cliente: ${cliente}
- Fecha anterior: ${fecha_anterior}
- Fecha nueva: ${fecha_nueva}

🔗 Revisar en: /admin/reubicaciones

Este es un mensaje automático del sistema de Reubicaciones.
    `;

    if (notifyService && gp_email) {
        try {
            await notifyService.sendEmail({
                to: gp_email,
                subject,
                text: body,
                html: body.replaceAll('\n', '<br>'),
                source: 'reubicaciones'
            });
        } catch (error) {
            console.error('[ReubicacionesSync] Error enviando alerta:', error);
        }
    }
}

async function checkDuplicateEvent(client, external_id) {
    const checkEvent = await client.query(
        `SELECT source_event_id FROM reubicaciones_source_events WHERE source_event_id = $1 FOR UPDATE`,
        [external_id]
    );
    return checkEvent.rows.length > 0;
}

async function getGpUserInfo(client, cedula) {
    const col = await client.query(
        `SELECT cedula, nombre, cliente, lider_catalogo FROM colaboradores WHERE cedula = $1`,
        [cedula]
    );
    if (col.rows.length === 0) return { existe: false };
    const { cliente, lider_catalogo: lider } = col.rows[0];
    let gp_user_id = null;
    if (cliente && lider) {
        const liderResult = await client.query(
            `SELECT gp_user_id FROM clientes_lideres WHERE cliente = $1 AND lider = $2 AND activo = TRUE LIMIT 1`,
            [cliente, lider]
        );
        gp_user_id = liderResult.rows[0]?.gp_user_id || null;
    }
    return { existe: true, gp_user_id };
}

async function sincronizarConPipeline({
    cedula,
    tipo_novedad,
    normalized,
    patch,
    staging_id, // opcional, para legacy compatibilidad si fuera necesario marcar, pero no lo usaremos para idempotencia.
    external_id,
    pool,
    notifyService
}) {
    const ced = normalizeCedula(cedula);
    if (!ced) throw new Error('Cédula inválida');
    if (!external_id) throw new Error('external_id (source_event_id) es requerido para idempotencia');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // CA-05: Idempotencia Transaccional. Si el evento ya existe, no hace nada y completamos con éxito.
        // Se usa ON CONFLICT DO NOTHING sobre la llave primaria.
        // Dejamos temporalmente pipeline_id null y lo actualizamos luego si se inserta (debido a fk no null).
        // Modificación arquitectónica: para que el DO NOTHING no requiera el pipeline_id que aún no tenemos en inserciones nuevas,
        // validaremos la existencia primero (bloqueo FOR UPDATE) o usamos una inserción inicial temporal si la BD lo permite.
        
        // Mejor enfoque: intentamos insertar el ID del evento primero con un pipeline ficticio temporal o lo insertamos al final, pero
        // para garantizar bloqueo de concurrencia podemos usar pg_advisory_xact_lock basado en un hash del external_id
        
        // Pero lo más limpio, de acuerdo a nuestra definición de source_events:
        // Buscamos si existe:
        if (await checkDuplicateEvent(client, external_id)) {
            // Evento duplicado exacto, ignorar
            await client.query('ROLLBACK');
            return { ok: true, idempotent: true, message: 'Evento ya sincronizado' };
        }

        // Obtener GP y cliente
        const { existe: colaboradorExiste, gp_user_id } = await getGpUserInfo(client, ced);

        const { fecha_fin, cliente_destino, causal } = computeFields(normalized, patch);
        
        // CA-06: Datos incompletos
        let motivoNovedadForzada = null;
        if (!fecha_fin) {
            motivoNovedadForzada = 'Falta fecha_termino en webhook';
        } else if (!colaboradorExiste) {
            motivoNovedadForzada = 'Colaborador no encontrado en base de datos';
        }

        const { estado, motivo } = calcularEstado({ 
            fecha_fin, 
            novedad: motivoNovedadForzada
        });

        // Revisar si ya existe el caso
        const casoExistente = await client.query(
            `SELECT id, estado, fecha_fin, tipo_ficha FROM reubicaciones_pipeline WHERE cedula = $1 FOR UPDATE`,
            [ced]
        );

        let pipeline_id;
        let esCasoExtension = false;
        let fecha_anterior = null;
        let fechaNuevaEfectiva = fecha_fin;

        if (casoExistente.rows.length === 0) {
            // CA-02: Nuevo Caso
            fechaNuevaEfectiva = fecha_fin || new Date(); // fallback para CA-06 (Con novedad)
            const insert = await client.query(
                `INSERT INTO reubicaciones_pipeline (cedula, fecha_fin, cliente_destino, causal, estado, motivo_novedad, tipo_ficha, ultimo_evento_id)
                 VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    ced, 
                    fechaNuevaEfectiva, 
                    cliente_destino || null, 
                    causal || null, 
                    estado, 
                    motivo, 
                    tipo_novedad.toUpperCase(),
                    external_id
                ]
            );
            pipeline_id = insert.rows[0].id;
        } else {
            // CA-04: Extensión / Corrección
            const existing = casoExistente.rows[0];
            pipeline_id = existing.id;
            fecha_anterior = existing.fecha_fin;
            
            // Evaluamos si verdaderamente es extensión
            esCasoExtension = (tipo_novedad === 'extension' || tipo_novedad === 'salida') && esExtension(fecha_anterior, fecha_fin);
            fechaNuevaEfectiva = fecha_fin || fecha_anterior;

            await client.query(
                `UPDATE reubicaciones_pipeline 
                 SET fecha_fin = $1::date, 
                     cliente_destino = COALESCE($2, cliente_destino), 
                     causal = COALESCE($3, causal), 
                     estado = $4, 
                     motivo_novedad = $5, 
                     tipo_ficha = $6,
                     ultimo_evento_id = $7,
                     updated_at = NOW() 
                 WHERE id = $8`,
                [
                    fechaNuevaEfectiva, 
                    cliente_destino || null, 
                    causal || null, 
                    estado, 
                    motivo, 
                    tipo_novedad.toUpperCase(),
                    external_id,
                    pipeline_id
                ]
            );
        }

        // HU-02 "historiza": Registrar el log técnico de auditoría y asegurar idempotencia transaccional
        await client.query(
            `INSERT INTO reubicaciones_source_events (source_event_id, pipeline_id, tipo_evento, fecha_anterior, fecha_nueva, processed_at)
             VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT DO NOTHING`,
            [
                external_id,
                pipeline_id,
                tipo_novedad,
                fecha_anterior,
                fechaNuevaEfectiva
            ]
        );

        if (staging_id) {
            await client.query(`UPDATE ficha_novedades_staging SET sincronizado_pipeline = TRUE WHERE id = $1::uuid`, [staging_id]);
        }

        await client.query('COMMIT');

        // CA-04: Enviar Alertas (fuera de la transacción de DB para que el commit sea rápido)
        if (esCasoExtension && gp_user_id) {
            const gp = await pool.query(`SELECT email FROM users WHERE id = $1::uuid`, [gp_user_id]);
            const gp_email = gp.rows[0]?.email;
            if (gp_email) {
                await generarAlertaExtension({ pipeline_id, cedula: ced, fecha_anterior, fecha_nueva: fecha_fin, gp_user_id, gp_email, pool, notifyService });
            }
        }

        return { ok: true, pipeline_id, cedula: ced, estado, motivo, es_extension: esCasoExtension, tipo_ficha: tipo_novedad.toUpperCase() };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function recoverySync({ pool, notifyService, dryRun = false, limit = 100 }) {
    const fichas = await pool.query(`
        SELECT 
            s.id as staging_id,
            s.external_id,
            s.tipo_novedad,
            s.payload_normalizado,
            s.colaborador_cedula_match
        FROM ficha_novedades_staging s
        WHERE s.status = 'aplicado'
          AND s.tipo_novedad IN ('extension', 'salida')
          AND (s.sincronizado_pipeline IS NULL OR s.sincronizado_pipeline = FALSE)
        LIMIT $1
    `, [limit]);

    if (dryRun) return { dry_run: true, found: fichas.rows.length };

    let processed = 0;
    let errors = 0;

    for (const ficha of fichas.rows) {
        try {
            await sincronizarConPipeline({
                cedula: ficha.colaborador_cedula_match,
                tipo_novedad: ficha.tipo_novedad,
                normalized: ficha.payload_normalizado || {},
                patch: ficha.payload_normalizado || {},
                staging_id: ficha.staging_id,
                external_id: ficha.external_id,
                pool,
                notifyService
            });
            processed++;
        } catch (error) {
            errors++;
            console.error('[Reubicaciones] Recovery error:', error.message);
        }
    }

    return { processed, errors };
}

module.exports = {
    sincronizarConPipeline,
    recoverySync,
    esExtension
};
