const { normalizeCedula } = require('../utils');
const { calcularEstado: calcularEstadoReubicacion } = require('./reubicacionesEstados');

function calcularEstado({
    fecha_fin,
    gp_user_id,
    cliente_destino,
    causal,
    colaborador_existe,
    motivo_novedad,
    fecha_actual
}) {
    return calcularEstadoReubicacion({
        fecha_fin,
        gp_user_id,
        cliente_destino,
        causal,
        colaborador_existe,
        motivo_novedad,
        fecha_actual
    });
}

function esExtension(fechaAnterior, fechaNueva) {
    if (!fechaAnterior) return false;
    const anterior = new Date(fechaAnterior);
    anterior.setHours(0, 0, 0, 0);
    const nueva = new Date(fechaNueva);
    nueva.setHours(0, 0, 0, 0);
    return nueva > anterior;
}

async function registrarHistorial({
    pipeline_id,
    estado_anterior,
    estado_nuevo,
    evento_id,
    motivo,
    pool
}) {
    await pool.query(
        `INSERT INTO reubicaciones_estado_historial 
         (pipeline_id, estado_anterior, estado_nuevo, evento_id, motivo)
         VALUES ($1, $2, $3, $4, $5)`,
        [pipeline_id, estado_anterior, estado_nuevo, evento_id, motivo]
    );
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
                html: body.replace(/\n/g, '<br>'),
                source: 'reubicaciones'
            });
        } catch (error) {
            console.error('[ReubicacionesSync] Error enviando alerta:', error);
        }
    }

    await pool.query(
        `UPDATE reubicaciones_pipeline SET alerta_extension_enviada = TRUE WHERE id = $1`,
        [pipeline_id]
    );
}

async function sincronizarConPipeline({
    cedula,
    tipo_novedad,
    normalized,
    patch,
    staging_id,
    external_id,
    source,
    event_type,
    sequence_number,
    shard_id,
    reviewer,
    pool,
    notifyService
}) {
    const ced = normalizeCedula(cedula);
    if (!ced) {
        throw new Error('Cédula inválida');
    }

    const yaProcesado = await pool.query(
        `SELECT 1 FROM ficha_novedades_staging 
         WHERE source = $1 
           AND external_id = $2 
           AND event_type = $3 
           AND COALESCE(sequence_number, '') = $4
           AND COALESCE(shard_id, '') = $5
           AND tipo_novedad IN ('extension', 'salida')
           AND status = 'aplicado'
           AND sincronizado_pipeline = TRUE
         LIMIT 1`,
        [source, external_id, event_type, sequence_number || '', shard_id || '']
    );
    
    if (yaProcesado.rows.length > 0) {
        return { 
            ok: true, 
            idempotent: true, 
            message: 'Evento ya sincronizado' 
        };
    }

    const colab = await pool.query(
        `SELECT cedula, nombre, gp_user_id, cliente FROM colaboradores WHERE cedula = $1`,
        [ced]
    );
    const colaboradorExiste = colab.rows.length > 0;
    const gp_user_id = colaboradorExiste ? colab.rows[0].gp_user_id : null;
    const colaborador_nombre = colaboradorExiste ? colab.rows[0].nombre : null;

    const fecha_fin = normalized.fecha_termino || patch.fecha_termino;
    const cliente_destino = normalized.cliente_destino || patch.cliente_destino || normalized.cliente || patch.cliente;
    const causal = normalized.causal || patch.causal || normalized.termino || patch.termino;

    if (!fecha_fin) {
        console.log('=== FICHA SIN FECHA ===');
        console.log({
            external_id,
            tipo_novedad,
            normalized,
            patch
        });
    
        throw new Error('Fecha de término requerida');
    }

    const { estado, motivo } = calcularEstado({
        fecha_fin,
        gp_user_id,
        cliente_destino,
        causal,
        colaborador_existe: colaboradorExiste
    });

    const casoExistente = await pool.query(
        `SELECT id, estado, fecha_fin, tipo_ficha FROM reubicaciones_pipeline WHERE cedula = $1`,
        [ced]
    );

    let pipeline_id;
    let esCasoExtension = false;
    let fecha_anterior = null;

    if (casoExistente.rows.length === 0) {
        const insert = await pool.query(
            `INSERT INTO reubicaciones_pipeline 
             (cedula, fecha_fin, cliente_destino, causal, estado, motivo_novedad, tipo_ficha, 
              gp_asignado_id, ultimo_evento_id)
             VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
                ced,
                fecha_fin,
                cliente_destino || null,
                causal || null,
                estado,
                motivo,
                tipo_novedad.toUpperCase(),
                gp_user_id || null,
                external_id
            ]
        );
        pipeline_id = insert.rows[0].id;

        await registrarHistorial({
            pipeline_id,
            estado_anterior: null,
            estado_nuevo: estado,
            evento_id: external_id,
            motivo: motivo || 'Caso creado desde ficha',
            pool
        });

    } else {
        const existing = casoExistente.rows[0];
        pipeline_id = existing.id;
        const estado_anterior = existing.estado;
        fecha_anterior = existing.fecha_fin;

        esCasoExtension =
            esExtension(fecha_anterior, fecha_fin) &&
            tipo_novedad === 'extension';

        await pool.query(
            `UPDATE reubicaciones_pipeline 
             SET fecha_fin = $1::date,
                 cliente_destino = COALESCE($2, cliente_destino),
                 causal = COALESCE($3, causal),
                 estado = $4,
                 motivo_novedad = $5,
                 tipo_ficha = $6,
                 gp_asignado_id = COALESCE($7, gp_asignado_id),
                 ultimo_evento_id = $8,
                 updated_at = NOW()
             WHERE id = $9`,
            [
                fecha_fin,
                cliente_destino || null,
                causal || null,
                estado,
                motivo,
                tipo_novedad.toUpperCase(),
                gp_user_id || null,
                external_id,
                pipeline_id
            ]
        );

        if (estado_anterior !== estado) {
            await registrarHistorial({
                pipeline_id,
                estado_anterior,
                estado_nuevo: estado,
                evento_id: external_id,
                motivo: motivo || `Cambio de estado desde ${estado_anterior}`,
                pool
            });
        }
    }

    if (staging_id) {
        await pool.query(
            `UPDATE ficha_novedades_staging SET sincronizado_pipeline = TRUE WHERE id = $1::uuid`,
            [staging_id]
        );
    }

    if (esCasoExtension && gp_user_id) {
        const gp = await pool.query(
            `SELECT email FROM users WHERE id = $1::uuid`,
            [gp_user_id]
        );
        const gp_email = gp.rows[0]?.email;

        if (gp_email) {
            await generarAlertaExtension({
                pipeline_id,
                cedula: ced,
                fecha_anterior,
                fecha_nueva: fecha_fin,
                gp_user_id,
                gp_email,
                pool,
                notifyService
            });
        }
    }

    return {
        ok: true,
        pipeline_id,
        cedula: ced,
        estado,
        motivo,
        es_extension: esCasoExtension,
        tipo_ficha: tipo_novedad.toUpperCase(),
        fecha_fin,
        colaborador: colaborador_nombre
    };
}

async function recoverySync({ pool, notifyService, dryRun = false, limit = 100 }) {

       
    console.log('=== RECOVERY SYNC NUEVO ===');
    console.log({
        poolExiste: !!pool,
        tipoPool: typeof pool,
        tieneQuery: typeof pool?.query
    });

    // 🔥 FIX: Crear conexión directa a la BD
    let db = pool;
    
    if (!db || typeof db.query !== 'function') {
        console.warn('⚠️ recoverySync: pool no recibido, creando conexión directa...');
        try {
            const { Pool } = require('pg');
            const poolConfig = {
                host: process.env.DB_HOST || 'localhost',
                port: Number(process.env.DB_PORT || 5432),
                database: process.env.DB_NAME || 'novedades_cinte',
                user: process.env.DB_USER || 'cinte_app',
                password: process.env.DB_PASSWORD,
                options: '-c client_encoding=UTF8'
            };
            db = new Pool(poolConfig);
            console.log('✅ recoverySync: conexión directa creada');
        } catch (e) {
            console.error('❌ recoverySync: error creando conexión directa:', e.message);
            throw new Error('No se pudo conectar a la base de datos');
        }
    }

    const fichas = await db.query(`
        SELECT 
            s.id as staging_id,
            s.external_id,
            s.tipo_novedad,
            s.payload_normalizado,
            s.colaborador_cedula_match,
            s.reviewed_by,
            s.source,
            s.event_type,
            s.sequence_number,
            s.shard_id
        FROM ficha_novedades_staging s
        WHERE s.status = 'aplicado'
          AND s.tipo_novedad IN ('extension', 'salida')
          AND (s.sincronizado_pipeline IS NULL OR s.sincronizado_pipeline = FALSE)
        LIMIT $1
    `, [limit]);

    if (dryRun) {
        return {
            dry_run: true,
            found: fichas.rows.length,
            fichas: fichas.rows.map(f => ({
                external_id: f.external_id,
                cedula: f.colaborador_cedula_match,
                tipo: f.tipo_novedad
            }))
        };
    }

    let processed = 0;
    let errors = 0;
    const errorDetails = [];

    for (const ficha of fichas.rows) {
        try {
            await sincronizarConPipeline({
                cedula: ficha.colaborador_cedula_match,
                tipo_novedad: ficha.tipo_novedad,
                normalized: ficha.payload_normalizado || {},
                patch: ficha.payload_normalizado || {},
                staging_id: ficha.staging_id,
                external_id: ficha.external_id,
                source: ficha.source,
                event_type: ficha.event_type,
                sequence_number: ficha.sequence_number,
                shard_id: ficha.shard_id,
                reviewer: { sub: ficha.reviewed_by },
                pool: db,
                notifyService
            });
            processed++;
        } catch (error) {
            errors++;
            errorDetails.push({
                external_id: ficha.external_id,
                cedula: ficha.colaborador_cedula_match,
                error: error.message
            });
            console.error('[RecoverySync] Error:', error.message);
        }
    }

    return { 
        processed, 
        errors, 
        error_details: errorDetails 
    };
}

module.exports = {
    sincronizarConPipeline,
    recoverySync,
    calcularEstado,
    esExtension,
    registrarHistorial,
    generarAlertaExtension
};