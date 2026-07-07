'use strict';

const { normalizeEstado } = require('./facturacionRevision');
const {
    canEditConciliacionAjustes,
    resolveNovedadMontoConAjuste,
    parseAjustesFromFacturacionRow
} = require('./conciliacionAjustes');
const { resolvePostedContactFromColaborador } = require('../colaboradorDirectory');
const { inferAreaFromNovedad } = require('../rbac');
const { resolveActorUserIdForSession } = require('../resolveActorUserId');

const TIPO_VACACIONES = 'Vacaciones en tiempo';
const BLOCKED_ESTADOS = new Set(['APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'CONCILIADA']);

const INSERT_HISTORIAL_NOVEDAD_MANUAL_SQL = `INSERT INTO conciliaciones_facturacion_historial
    (facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
     observacion, detalle, actor_user_id, actor_email, actor_nombre, actor_role)
 VALUES ($1, $2, $3, $4, 'NOVEDAD_MANUAL', 'ANALISTA', $5, $5, $6, $7::jsonb, $8::uuid, $9, $10, $11::user_role)`;

function buildNovedadManualHistorialObservacion(fechaInicio, fechaFin, diasHabiles) {
    const dias = Number(diasHabiles) || 0;
    const suf = dias === 1 ? 'día hábil' : 'días hábiles';
    return `Vacaciones en tiempo manual: ${fechaInicio} a ${fechaFin} (${dias} ${suf}).`;
}

async function ensureConciliacionFacturacionRow(pool, ced, anio, mes) {
    const q = await pool.query(
        `SELECT id, estado FROM conciliaciones_facturacion
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1
           AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [ced, anio, mes]
    );
    if (q.rows[0]?.id) return q.rows[0];

    const ins = await pool.query(
        `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, fecha_cierre, updated_at)
         VALUES ($1, $2, $3, 'PENDIENTE', CURRENT_DATE, NOW())
         RETURNING id, estado`,
        [ced, anio, mes]
    );
    return ins.rows[0];
}

async function insertNovedadManualHistorial(pool, ctx) {
    const {
        facturacionId,
        ced,
        anio,
        mes,
        estado,
        revActor,
        actorUserId,
        fechaInicio,
        fechaFin,
        diasHabiles,
        novedadId,
        montoCop
    } = ctx;
    const detalle = {
        campo: 'novedad_manual',
        tipoNovedad: TIPO_VACACIONES,
        novedadId: String(novedadId),
        fechaInicio,
        fechaFin,
        diasHabiles: Number(diasHabiles) || 0,
        montoCop: Math.round(Number(montoCop) || 0)
    };
    await pool.query(INSERT_HISTORIAL_NOVEDAD_MANUAL_SQL, [
        facturacionId,
        ced,
        anio,
        mes,
        estado,
        buildNovedadManualHistorialObservacion(fechaInicio, fechaFin, diasHabiles),
        JSON.stringify(detalle),
        actorUserId,
        revActor.email,
        revActor.nombre,
        revActor.role
    ]);
}

const INSERT_NOVEDAD_MANUAL_SQL = `INSERT INTO novedades (
    nombre, cedula, correo_solicitante, cliente, lider, gp_user_id, tipo_novedad, area,
    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
    cantidad_horas, observaciones, estado,
    aprobado_en, aprobado_por_rol, aprobado_por_user_id, aprobado_por_email
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8::user_area,
    $9::date, NULL, NULL, $10::date, $11::date,
    $12, $13, 'Aprobado'::novedad_estado,
    (($11::date + TIME '23:59:59') AT TIME ZONE 'America/Bogota'), $14::user_role, $15::uuid, NULLIF($16::text, '')
) RETURNING id, nombre, cedula, tipo_novedad, cantidad_horas, estado, fecha, fecha_inicio, fecha_fin, creado_en, monto_cop`;

function buildRevisionActor(actor, scope) {
    const role = String(actor?.role || scope?.role || '').trim().toLowerCase();
    const email = String(actor?.email || '').trim().toLowerCase();
    const nombre = String(actor?.full_name || actor?.fullName || actor?.name || email || 'Usuario').trim();
    const userId = actor?.id || actor?.sub || null;
    return { role, email: email || 'sin-correo@local', nombre: nombre || 'Usuario', userId };
}

function countBusinessDaysInclusive(startDateRaw, endDateRaw, festivosSet = null) {
    if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
    const start = new Date(`${startDateRaw}T00:00:00`);
    const end = new Date(`${endDateRaw}T00:00:00`);
    let count = 0;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const day = cursor.getDay();
        if (day === 0 || day === 6) continue;
        const ymd = cursor.toISOString().slice(0, 10);
        if (festivosSet && typeof festivosSet.has === 'function' && festivosSet.has(ymd)) continue;
        count += 1;
    }
    return count;
}

function mapRowToDetalleItem(row, tarifaMaestro, ajustes, impactOpts, aprobadorLabel) {
    const impact = resolveNovedadMontoConAjuste(tarifaMaestro, row, ajustes, impactOpts);
    return {
        id: row.id,
        nombre: String(row.nombre || '').trim(),
        cedula: String(row.cedula || '').trim(),
        tipoNovedad: String(row.tipo_novedad || '').trim(),
        montoCop: impact.montoCop,
        montoMaestro: impact.montoMaestro,
        montoAjustado: impact.montoAjustado,
        montoOrigen: impact.montoOrigen,
        impacto: impact.impacto,
        medida: impact.medida,
        cantidad: impact.cantidad,
        cantidadHoras: impact.cantidadHoras ?? null,
        cantidadHorasMaestro: impact.cantidadHorasMaestro ?? null,
        cantidadHorasAjustado: impact.cantidadHorasAjustado ?? false,
        montoCalculado: impact.montoCalculado,
        valorHora: impact.valorHora ?? null,
        valorHoraMaestro: impact.valorHoraMaestro ?? null,
        valorHoraAjustado: impact.valorHoraAjustado ?? false,
        estado: String(row.estado || ''),
        fecha: row.fecha ? row.fecha.toISOString().slice(0, 10) : null,
        fechaInicio: row.fecha_inicio ? row.fecha_inicio.toISOString().slice(0, 10) : null,
        fechaFin: row.fecha_fin ? row.fecha_fin.toISOString().slice(0, 10) : null,
        creadoEn: row.creado_en ? row.creado_en.toISOString() : null,
        aprobador: String(aprobadorLabel || 'Aprobador CINTE').trim()
    };
}

/**
 * Alta manual de novedad aprobada desde conciliaciones (v1: Vacaciones en tiempo).
 */
async function createConciliacionNovedadManual(deps, scope, payload, actor) {
    const { pool, normalizeCedula, normalizeCatalogValue, getColaboradorByCedula, getLideresByCliente, getFestivosSet } =
        deps;
    const {
        cliente,
        cedula,
        anio,
        mes,
        servicioId,
        tipoNovedad,
        fechaInicio,
        fechaFin,
        billingType,
        billingMode,
        baseHours
    } = payload || {};

    const revActor = buildRevisionActor(actor, scope);
    if (!canEditConciliacionAjustes(revActor.role, 'PENDIENTE')) {
        const error = new Error('No autorizado para registrar novedades manuales');
        error.status = 403;
        throw error;
    }

    const tipo = String(tipoNovedad || '').trim();
    if (tipo !== TIPO_VACACIONES) {
        const error = new Error(`Tipo de novedad no soportado: ${tipo || '(vacío)'}`);
        error.status = 400;
        throw error;
    }

    const ced = normalizeCedula(cedula);
    if (!ced) {
        const error = new Error('Cédula inválida');
        error.status = 400;
        throw error;
    }

    const y = Number(anio);
    const m = Number(mes);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
        const error = new Error('Año inválido');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(m) || m < 1 || m > 12) {
        const error = new Error('Mes inválido');
        error.status = 400;
        throw error;
    }

    const fi = String(fechaInicio || '').trim();
    const ff = String(fechaFin || '').trim();
    if (!fi) {
        const error = new Error('Fecha inicio es obligatoria');
        error.status = 400;
        throw error;
    }
    if (!ff) {
        const error = new Error('Vacaciones en tiempo requiere Fecha Fin.');
        error.status = 400;
        throw error;
    }
    if (ff < fi) {
        const error = new Error('La fecha fin debe ser mayor o igual a la fecha inicio');
        error.status = 400;
        throw error;
    }

    const { assertClienteConciliacionPermitido, listConciliacionNovedadesDetalle } = require('./conciliacionesQueries');
    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    if (typeof getColaboradorByCedula !== 'function') {
        const error = new Error('Servicio de colaboradores no disponible');
        error.status = 500;
        throw error;
    }
    const colaborador = await getColaboradorByCedula(ced);
    if (!colaborador) {
        const error = new Error('Colaborador no encontrado');
        error.status = 404;
        throw error;
    }

    const merged = resolvePostedContactFromColaborador({}, colaborador, normalizeCatalogValue);
    const colCliente = merged.cliente;
    if (!colCliente) {
        const error = new Error('Colaborador sin cliente asignado');
        error.status = 400;
        throw error;
    }
    if (normalizeCatalogValue(colCliente).toLowerCase() !== normalizeCatalogValue(chk.canon).toLowerCase()) {
        const error = new Error('El colaborador no pertenece al cliente del workspace');
        error.status = 400;
        throw error;
    }

    const lider = merged.lider;
    if (!lider) {
        const error = new Error('Colaborador sin líder asignado');
        error.status = 400;
        throw error;
    }
    if (typeof getLideresByCliente === 'function') {
        const lideresValidos = await getLideresByCliente(colCliente);
        const fold = (s) =>
            String(s || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        const liderOk = lideresValidos.some((li) => fold(li) === fold(lider));
        if (!liderOk) {
            const error = new Error('El líder del colaborador no pertenece al cliente');
            error.status = 400;
            throw error;
        }
    }

    const factQ = await pool.query(
        `SELECT id, estado FROM conciliaciones_facturacion
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1
           AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [ced, y, m]
    );
    const estadoFact = normalizeEstado(factQ.rows[0]?.estado || 'PENDIENTE');
    if (BLOCKED_ESTADOS.has(estadoFact)) {
        const error = new Error('No se pueden agregar novedades manuales en el estado actual del cierre');
        error.status = 409;
        throw error;
    }
    if (!canEditConciliacionAjustes(revActor.role, estadoFact)) {
        const error = new Error('No autorizado para registrar novedades manuales en el estado actual');
        error.status = 403;
        throw error;
    }

    let festivosSet = null;
    if (typeof getFestivosSet === 'function') {
        try {
            festivosSet = await getFestivosSet();
        } catch {
            festivosSet = null;
        }
    }
    const diasHabiles = countBusinessDaysInclusive(fi, ff, festivosSet);
    if (diasHabiles <= 0) {
        const error = new Error('El rango de fechas no contiene días hábiles para vacaciones.');
        error.status = 400;
        throw error;
    }

    const nombre = String(colaborador.nombre || '').trim() || ced;
    const correo = merged.correo || null;
    const gpUserId = colaborador.gp_user_id || null;
    const area = inferAreaFromNovedad({ tipoNovedad: TIPO_VACACIONES });
    const mesYmd = `${y}-${String(m).padStart(2, '0')}`;
    const servicioRef = servicioId ? String(servicioId).trim() : '';
    const observaciones = servicioRef
        ? `[CONCILIACION_MANUAL] servicio=${servicioRef}; mes=${mesYmd}`
        : `[CONCILIACION_MANUAL] mes=${mesYmd}`;

    const aprobadoPorUserId = await resolveActorUserIdForSession(pool, {
        sub: revActor.userId,
        email: revActor.email
    });

    const insertQ = await pool.query(INSERT_NOVEDAD_MANUAL_SQL, [
        nombre,
        ced,
        correo,
        colCliente,
        lider,
        gpUserId,
        TIPO_VACACIONES,
        area,
        fi,
        fi,
        ff,
        diasHabiles,
        observaciones,
        revActor.role,
        aprobadoPorUserId,
        revActor.email
    ]);
    const inserted = insertQ.rows[0];
    if (!inserted?.id) {
        const error = new Error('No se pudo registrar la novedad');
        error.status = 500;
        throw error;
    }

    const impactOpts = {
        billingType: billingType || undefined,
        billingMode: billingMode || undefined,
        baseHours: baseHours || undefined,
        factAnio: y,
        factMes: m
    };

    const detalle = await listConciliacionNovedadesDetalle(deps, scope, chk.canon, ced, y, m, impactOpts);
    const itemFromList = (detalle.items || []).find((it) => String(it.id) === String(inserted.id));
    const item =
        itemFromList ||
        mapRowToDetalleItem(
            inserted,
            detalle.tarifaMaestro ?? 0,
            parseAjustesFromFacturacionRow({}),
            impactOpts,
            revActor.nombre
        );

    const factRow = factQ.rows[0]?.id ? factQ.rows[0] : await ensureConciliacionFacturacionRow(pool, ced, y, m);
    if (factRow?.id) {
        await insertNovedadManualHistorial(pool, {
            facturacionId: factRow.id,
            ced,
            anio: y,
            mes: m,
            estado: normalizeEstado(factRow.estado || estadoFact),
            revActor,
            actorUserId: aprobadoPorUserId,
            fechaInicio: fi,
            fechaFin: ff,
            diasHabiles,
            novedadId: inserted.id,
            montoCop: item.montoCop
        });
    }

    return {
        novedadId: inserted.id,
        item,
        cantidadHoras: diasHabiles
    };
}

module.exports = {
    TIPO_VACACIONES,
    BLOCKED_ESTADOS,
    countBusinessDaysInclusive,
    buildNovedadManualHistorialObservacion,
    insertNovedadManualHistorial,
    createConciliacionNovedadManual
};
