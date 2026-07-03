'use strict';

const { collectRecargoDayKeysInInterval } = require('./heBogotaSplit');
const { computeMallaRecargoPayload } = require('./mallaRecargoSplit');
const { recomputeAndPersistDomingoRecargoGroup } = require('./heDomingoRecargoGroup');
const { toUtcMsFromDateAndTime } = require('./novedadHeTime');
const { resolveNocturnoDateTimeRange } = require('./directorio/mallaNocturnoConfig');
const { resolvePostedContactFromColaborador } = require('./colaboradorDirectory');
const { inferAreaFromNovedad } = require('./rbac');
const { normalizeCatalogValue } = require('./utils');
const { foldForMatch } = require('./cotizador/clienteNombreMatch');
const festivosService = require('./festivosService');

const FRANJAS_MALLAS = ['06_14', '14_22', '22_06'];
const FRANJAS_NOCTURNOS = ['22_06'];

/**
 * @param {'mallas'|'nocturnos'} variant
 * @returns {string[]}
 */
function franjasForVariant(variant) {
    return variant === 'nocturnos' ? FRANJAS_NOCTURNOS : FRANJAS_MALLAS;
}

/**
 * @param {string} ymd YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/**
 * @param {number} anio
 * @param {number} mes 1-12
 * @returns {{ desde: string, hasta: string }}
 */
function monthRangeYmd(anio, mes) {
    const mm = String(mes).padStart(2, '0');
    const lastDay = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    return {
        desde: `${anio}-${mm}-01`,
        hasta: `${anio}-${mm}-${String(lastDay).padStart(2, '0')}`
    };
}

/**
 * @param {string} fecha YYYY-MM-DD
 * @param {'06_14'|'14_22'|'22_06'} franja
 * @returns {{ fechaInicio: string, horaInicio: string, fechaFin: string, horaFin: string }}
 */
function franjaToDateTimeRange(fecha, franja) {
    if (franja === '06_14') {
        return { fechaInicio: fecha, horaInicio: '06:00', fechaFin: fecha, horaFin: '14:00' };
    }
    if (franja === '14_22') {
        return { fechaInicio: fecha, horaInicio: '14:00', fechaFin: fecha, horaFin: '22:00' };
    }
    if (franja === '22_06') {
        return { fechaInicio: fecha, horaInicio: '22:00', fechaFin: addDaysYmd(fecha, 1), horaFin: '06:00' };
    }
    throw Object.assign(new Error('Franja inválida'), { status: 400 });
}

/**
 * @param {string} cliente
 * @param {'mallas'|'nocturnos'} variant
 * @param {string} fecha
 * @param {string} franja
 * @param {string} cedula
 */
function buildMallaOrigenRef(cliente, variant, fecha, franja, cedula) {
    return `${normalizeCatalogValue(cliente)}|${variant}|${fecha}|${franja}|${cedula}`;
}

function variantLabel(variant) {
    return variant === 'nocturnos' ? 'turnos nocturnos' : 'mallas de turnos';
}

function formatAprobacionFechaObs(isoOrDate) {
    if (!isoOrDate) return '';
    try {
        const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
        if (Number.isNaN(d.getTime())) return String(isoOrDate);
        return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return String(isoOrDate);
    }
}

function canReaprobarMallaRole(role) {
    const r = String(role || '').trim();
    return r === 'super_admin' || r === 'cac';
}

const INSERT_NOVEDAD_MALLA_SQL = `INSERT INTO novedades (
    nombre, cedula, correo_solicitante, cliente, lider, gp_user_id, tipo_novedad, area,
    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
    cantidad_horas, horas_diurnas, horas_nocturnas, horas_recargo_domingo,
    horas_recargo_domingo_diurnas, horas_recargo_domingo_nocturnas, horas_recargo_nocturno, tipo_hora_extra,
    observaciones, estado, malla_origen_ref,
    aprobado_en, aprobado_por_rol, aprobado_por_user_id, aprobado_por_email
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8::user_area,
    $9::date, $10::time, $11::time, $12::date, $13::date,
    $14, $15, $16, $17, $18, $19, $20, $21,
    $22, 'Aprobado'::novedad_estado, $23,
    NOW(), $24::user_role, $25::uuid, NULLIF($26::text, '')
) RETURNING id`;

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {string} deps.cliente
 * @param {number} deps.anio
 * @param {number} deps.mes
 * @param {'mallas'|'nocturnos'} deps.variant
 * @param {{ userId: string|null, email: string, role: string }} deps.approver
 * @param {(cedula: string) => Promise<object|null>} deps.getColaboradorByCedula
 * @param {(cliente: string) => Promise<string[]>} deps.getLideresByCliente
 * @param {(opts: { cliente: string, desde: string, hasta: string }) => Promise<Array<object>>} deps.listMallaTurnosCeldasRange
 * @param {() => Promise<{ horaInicio: string, horaFin: string }>} [deps.getMallaNocturnoConfig]
 */
async function aprobarMallaTurnosMes(deps) {
    const {
        pool,
        cliente: clienteRaw,
        anio,
        mes,
        variant,
        approver,
        getColaboradorByCedula,
        getLideresByCliente,
        listMallaTurnosCeldasRange,
        getMallaNocturnoConfig,
        allowReaprobacion = false
    } = deps;

    const cliente = normalizeCatalogValue(clienteRaw);
    if (!cliente) {
        throw Object.assign(new Error('Cliente es obligatorio'), { status: 400 });
    }
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
        throw Object.assign(new Error('Año inválido'), { status: 400 });
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        throw Object.assign(new Error('Mes inválido'), { status: 400 });
    }
    if (variant !== 'mallas' && variant !== 'nocturnos') {
        throw Object.assign(new Error('Variant inválido'), { status: 400 });
    }

    const approverEmail = String(approver?.email || '').trim();
    const approverRole = String(approver?.role || '').trim();
    if (!approverEmail || !approverRole) {
        throw Object.assign(new Error('Aprobador inválido'), { status: 400 });
    }

    const { desde, hasta } = monthRangeYmd(anio, mes);
    const allowedFranjas = new Set(franjasForVariant(variant));
    const allItems = await listMallaTurnosCeldasRange({ cliente, desde, hasta });
    // AUT-550: cada pestaña aprueba solo sus propias asignaciones (no las del otro origen),
    // aunque compartan la franja 22_06.
    const items = allItems.filter(
        (it) =>
            allowedFranjas.has(String(it.franja)) &&
            (String(it.origen || 'mallas') === variant)
    );

    if (items.length === 0) {
        throw Object.assign(new Error('No hay asignaciones para aprobar en este mes.'), { status: 400 });
    }

    let nocturnoFallback = null;
    if (variant === 'nocturnos' && typeof getMallaNocturnoConfig === 'function') {
        nocturnoFallback = await getMallaNocturnoConfig();
    }

    const festivosSet = await festivosService.getFestivosSet();
    const mesYmd = `${anio}-${String(mes).padStart(2, '0')}`;
    const observacionesBase = `Generada desde malla aprobada (cliente ${cliente}, ${mesYmd}, ${variantLabel(variant)}).`;
    const area = inferAreaFromNovedad({ tipoNovedad: 'Hora Extra' });
    const puedeReaprobar = allowReaprobacion || canReaprobarMallaRole(approverRole);

    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');

        const lockQ = await dbClient.query(
            `INSERT INTO malla_turno_aprobacion (
                cliente, anio, mes, variant,
                aprobado_por_user_id, aprobado_por_email, aprobado_por_rol, novedades_generadas
            ) VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, 0)
            ON CONFLICT (cliente, anio, mes, variant) DO NOTHING
            RETURNING id, aprobado_en`,
            [cliente, anio, mes, variant, approver.userId || null, approverEmail, approverRole]
        );

        let isReaprobacion = false;
        let aprobacionId;
        let aprobadoEnOriginal = null;

        if (!lockQ.rows?.[0]?.id) {
            if (!puedeReaprobar) {
                throw Object.assign(
                    new Error('Este mes ya fue aprobado para esta pestaña. El proceso no se puede revertir.'),
                    { status: 409 }
                );
            }
            const existingQ = await dbClient.query(
                `SELECT id, aprobado_en
                 FROM malla_turno_aprobacion
                 WHERE cliente = $1 AND anio = $2 AND mes = $3 AND variant = $4
                 FOR UPDATE`,
                [cliente, anio, mes, variant]
            );
            const existing = existingQ.rows?.[0];
            if (!existing?.id) {
                throw Object.assign(new Error('No se encontró el registro de aprobación.'), { status: 409 });
            }
            isReaprobacion = true;
            aprobacionId = existing.id;
            aprobadoEnOriginal = existing.aprobado_en;
        } else {
            aprobacionId = lockQ.rows[0].id;
        }

        const observacionesReaprobacion = `Modificación a la aprobación original de malla (cliente ${cliente}, ${mesYmd}, ${variantLabel(
            variant
        )}). Aprobación inicial: ${formatAprobacionFechaObs(aprobadoEnOriginal)}.`;

        let novedadesGeneradas = 0;
        let totalHoras = 0;
        const modStamp = Date.now();
        /** @type {Map<string, Set<string>>} */
        const domingoRecomputeQueue = new Map();

        for (const item of items) {
            const cedula = String(item.cedula || '').trim();
            const fecha = String(item.fecha || '').trim();
            const franja = String(item.franja || '').trim();
            const colaborador = await getColaboradorByCedula(cedula);
            if (!colaborador) {
                throw Object.assign(
                    new Error(`Colaborador ${cedula} (${fecha}, ${franja}) no está registrado o inactivo.`),
                    { status: 400 }
                );
            }

            const nombre = String(colaborador.nombre || item.nombre || '').trim() || cedula;

            const merged = resolvePostedContactFromColaborador({}, colaborador, normalizeCatalogValue);
            const colCliente = merged.cliente;
            const lider = merged.lider;
            const correo = merged.correo || approverEmail;

            if (!colCliente || foldForMatch(colCliente) !== foldForMatch(cliente)) {
                throw Object.assign(
                    new Error(`Colaborador ${nombre} (${fecha}) no pertenece al cliente ${cliente}.`),
                    { status: 400 }
                );
            }
            if (!lider) {
                throw Object.assign(
                    new Error(`Colaborador ${nombre} (${fecha}) no tiene líder en directorio.`),
                    { status: 400 }
                );
            }

            const lideresValidos = await getLideresByCliente(cliente);
            const liderOk = lideresValidos.some((li) => foldForMatch(li) === foldForMatch(lider));
            if (!liderOk) {
                throw Object.assign(
                    new Error(`Líder de ${nombre} (${fecha}) no es válido para el cliente ${cliente}.`),
                    { status: 400 }
                );
            }

            const { fechaInicio, horaInicio, fechaFin, horaFin } =
                variant === 'nocturnos' && franja === '22_06'
                    ? resolveNocturnoDateTimeRange(
                          fecha,
                          item.horaInicio || nocturnoFallback?.horaInicio || '22:00',
                          item.horaFin || nocturnoFallback?.horaFin || '06:00'
                      )
                    : franjaToDateTimeRange(fecha, franja);
            const startMs = toUtcMsFromDateAndTime(fechaInicio, horaInicio);
            const endMs = toUtcMsFromDateAndTime(fechaFin, horaFin);
            const recargo = computeMallaRecargoPayload(startMs, endMs, festivosSet);
            if (recargo.skip) {
                continue;
            }
            const mallaOrigenRefBase = buildMallaOrigenRef(cliente, variant, fecha, franja, cedula);
            const dupQ = await dbClient.query(
                `SELECT id FROM novedades
                 WHERE malla_origen_ref = $1 OR malla_origen_ref LIKE $2
                 LIMIT 1`,
                [mallaOrigenRefBase, `${mallaOrigenRefBase}|mod:%`]
            );
            if (dupQ.rows?.[0]?.id) {
                continue;
            }

            const mallaOrigenRef = isReaprobacion
                ? `${mallaOrigenRefBase}|mod:${modStamp}`
                : mallaOrigenRefBase;
            const observaciones = isReaprobacion ? observacionesReaprobacion : observacionesBase;

            await dbClient.query(INSERT_NOVEDAD_MALLA_SQL, [
                nombre,
                cedula,
                correo,
                colCliente,
                lider,
                colaborador.gp_user_id || null,
                'Hora Extra',
                area,
                fechaInicio,
                horaInicio,
                horaFin,
                fechaInicio,
                fechaFin,
                recargo.cantidadHoras,
                recargo.horasDiurnas,
                recargo.horasNocturnas,
                recargo.horasRecargoDomingo,
                recargo.horasRecargoDomingoDiurnas,
                recargo.horasRecargoDomingoNocturnas,
                recargo.horasRecargoNocturno,
                recargo.tipoHoraExtra,
                observaciones,
                mallaOrigenRef,
                approverRole,
                approver.userId || null,
                approverEmail
            ]);
            novedadesGeneradas += 1;
            totalHoras += Number(recargo.cantidadHoras) || 0;
            for (const dayKey of collectRecargoDayKeysInInterval(startMs, endMs, festivosSet)) {
                if (!domingoRecomputeQueue.has(cedula)) domingoRecomputeQueue.set(cedula, new Set());
                domingoRecomputeQueue.get(cedula).add(dayKey);
            }
        }

        let upd;
        if (isReaprobacion) {
            upd = await dbClient.query(
                `UPDATE malla_turno_aprobacion
                 SET aprobado_por_user_id = $1::uuid,
                     aprobado_por_email = $2,
                     aprobado_por_rol = $3,
                     aprobado_en = NOW(),
                     novedades_generadas = novedades_generadas + $4
                 WHERE id = $5::uuid
                 RETURNING aprobado_en`,
                [approver.userId || null, approverEmail, approverRole, novedadesGeneradas, aprobacionId]
            );
        } else {
            upd = await dbClient.query(
                `UPDATE malla_turno_aprobacion SET novedades_generadas = $1 WHERE id = $2::uuid RETURNING aprobado_en`,
                [novedadesGeneradas, aprobacionId]
            );
        }

        await dbClient.query('COMMIT');

        for (const [cedulaRec, dayKeys] of domingoRecomputeQueue) {
            await recomputeAndPersistDomingoRecargoGroup(pool, cedulaRec, [...dayKeys], festivosSet);
        }

        const aprobadoEn = upd.rows?.[0]?.aprobado_en;
        return {
            novedadesGeneradas,
            horasGeneradas: Math.round(totalHoras * 100) / 100,
            reaprobacion: isReaprobacion,
            aprobadoEn: aprobadoEn ? aprobadoEn.toISOString() : lockQ.rows[0]?.aprobado_en?.toISOString?.() || null
        };
    } catch (e) {
        try {
            await dbClient.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw e;
    } finally {
        dbClient.release();
    }
}

module.exports = {
    franjasForVariant,
    franjaToDateTimeRange,
    buildMallaOrigenRef,
    monthRangeYmd,
    addDaysYmd,
    canReaprobarMallaRole,
    formatAprobacionFechaObs,
    aprobarMallaTurnosMes,
    computeMallaRecargoPayload
};
