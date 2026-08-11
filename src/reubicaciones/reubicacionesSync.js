const { normalizeCedula } = require('../utils');

function calcularEstado({
    fecha_fin,
    gp_user_id,
    cliente_destino,
    causal,
    colaborador_existe
}) {
    if (!colaborador_existe) {
        return {
            estado: 'Con novedad',
            motivo: 'Colaborador no encontrado en tabla maestra'
        };
    }

    if (!gp_user_id) {
        return {
            estado: 'Con novedad',
            motivo: 'Sin GP asignado'
        };
    }

    const faltanDatos = [];
    if (!cliente_destino) faltanDatos.push('cliente destino');
    if (!causal) faltanDatos.push('causal');

    if (faltanDatos.length > 0) {
        return {
            estado: 'Con novedad',
            motivo: `Faltan datos: ${faltanDatos.join(', ')}`
        };
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fecha_fin);
    fecha.setHours(0, 0, 0, 0);
    const diffDias = Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
        return {
            estado: 'Con novedad',
            motivo: 'Fecha fin vencida'
        };
    } else if (diffDias === 0) {
        return {
            estado: 'En proceso',
            motivo: null
        };
    } else {
        return {
            estado: 'Pendiente',
            motivo: null
        };
    }
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

//nuevo
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

    const gpInfo = await pool.query(
        `SELECT full_name FROM users WHERE id = $1::uuid`,
        [gp_user_id]
    );
    const gp_nombre = gpInfo.rows[0]?.full_name || 'GP';

   
    const rolesDestinatarios = await pool.query(`
        SELECT DISTINCT email, role, full_name 
        FROM users 
        WHERE role IN ('atraccion_talento', 'super_admin')
          AND email IS NOT NULL
          AND email != ''
    `);
    
    const emails = rolesDestinatarios.rows.map(u => u.email).filter(Boolean);

    if (gp_email && gp_email.trim()) {
        if (!emails.includes(gp_email)) {
            emails.push(gp_email);
        }
    } else {
        console.warn(`⚠️ GP del caso ${pipeline_id} no tiene email:`, gp_user_id);
    }


    await notifyService.publishReubicacionAlerta({
        eventId: require('crypto').randomUUID(),
        occurredAt: new Date().toISOString(),
        casoId: pipeline_id,
        consultor: { nombre, cedula },
        hito: 'extension',
        fechaFin: fecha_nueva,
        diasRestantes: null,
        estado: 'En proceso',
        clienteActual: cliente,
        gp: { nombre: gp_nombre, email: gp_email },
        observacion: `Extensión: ${fecha_anterior} → ${fecha_nueva}`,
        destinatarios: emails,  // ← GP del caso + AT + super_admin ✅
        meta: { source: 'reubicaciones_sync', env: process.env.NODE_ENV || 'development' }
    });

    await pool.query(
        `UPDATE reubicaciones_pipeline SET alerta_extension_enviada = TRUE WHERE id = $1`,
        [pipeline_id]
    );
}


async function generarAlertaNovedad({
    pipeline_id,
    cedula,
    motivo,
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

    const gpInfo = await pool.query(
        `SELECT full_name FROM users WHERE id = $1::uuid`,
        [gp_user_id]
    );
    const gp_nombre = gpInfo.rows[0]?.full_name || 'GP';

    const casoInfo = await pool.query(
        `SELECT fecha_fin FROM reubicaciones_pipeline WHERE id = $1`,
        [pipeline_id]
    );
    const fecha_fin = casoInfo.rows[0]?.fecha_fin || new Date().toISOString().slice(0, 10);

    // ============================================
    // 🔥 SOLO AT + super_admin (globales)
    // ============================================
    const rolesDestinatarios = await pool.query(`
        SELECT DISTINCT email, role, full_name 
        FROM users 
        WHERE role IN ('atraccion_talento', 'super_admin')
          AND email IS NOT NULL
          AND email != ''
    `);
    
    const emails = rolesDestinatarios.rows.map(u => u.email).filter(Boolean);

    if (gp_email && gp_email.trim()) {
        if (!emails.includes(gp_email)) {
            emails.push(gp_email);
        }
    } else {
        console.warn(`⚠️ GP del caso ${pipeline_id} no tiene email:`, gp_user_id);
    }

    await notifyService.publishReubicacionAlerta({
        eventId: require('crypto').randomUUID(),
        occurredAt: new Date().toISOString(),
        casoId: pipeline_id,
        consultor: { nombre, cedula },
        hito: 'novedad',
        fechaFin: fecha_fin,
        diasRestantes: null,
        estado: 'Con novedad',
        clienteActual: cliente,
        gp: { nombre: gp_nombre, email: gp_email },
        observacion: motivo,
        destinatarios: emails,  // ← GP del caso + AT + super_admin ✅
        meta: { source: 'reubicaciones_sync', env: process.env.NODE_ENV || 'development' }
    });

    await pool.query(`
        INSERT INTO alertas_correo_control (caso_id, hito, enviado, fecha_envio)
        VALUES ($1, 'novedad', true, NOW())
        ON CONFLICT (caso_id, hito) DO NOTHING
    `, [pipeline_id]);
}
//nuevo


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
        `SELECT cedula, nombre, cliente FROM colaboradores WHERE cedula = $1`,
        [ced]
    );
    const colaboradorExiste = colab.rows.length > 0;
    const colaborador_nombre = colaboradorExiste ? colab.rows[0].nombre : null;
    const cliente = colaboradorExiste ? colab.rows[0].cliente : null;
    
    // 2. Obtener GP desde clientes_lideres usando el cliente
    let gp_user_id = null;
    if (cliente) {
        const lider = await pool.query(
            `SELECT gp_user_id FROM clientes_lideres WHERE cliente = $1 AND activo = TRUE LIMIT 1`,
            [cliente]
        );
        gp_user_id = lider.rows[0]?.gp_user_id || null;
    }

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

            //nuevo
            if (estado === 'Con novedad' && estado_anterior !== 'Con novedad') {
                const gp = await pool.query(
                    `SELECT email FROM users WHERE id = $1::uuid`,
                    [gp_user_id]
                );
                const gp_email = gp.rows[0]?.email;
            
                await generarAlertaNovedad({
                    pipeline_id,
                    cedula: ced,
                    motivo: motivo || 'Novedad en el caso',
                    gp_user_id,
                    gp_email,
                    pool,
                    notifyService
                });
            }
            //nuevo
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
        console.warn('recoverySync: pool no recibido, creando conexión directa...');
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
            console.log('recoverySync: conexión directa creada');
        } catch (e) {
            console.error('recoverySync: error creando conexión directa:', e.message);
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
    generarAlertaExtension,
    generarAlertaNovedad
};