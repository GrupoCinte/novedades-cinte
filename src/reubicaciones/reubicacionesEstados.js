const { getFestivosColombia, parseDateOnly, toYmd } = require('./colombiaFestivos');
const { semaforoFromDiasRestantes } = require('./reubicacionesSemaforo');

const ESTADOS = {
    PENDIENTE: 'Pendiente',
    EN_PROCESO: 'En proceso',
    CON_NOVEDAD: 'Con novedad',
    VENCIDO: 'Vencido',
    RESUELTO: 'Resuelto'
};

function normalizeDateValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function contarDiasHabilesColombia(fechaInicio, fechaFin, holidayMap = null) {
    const inicio = normalizeDateValue(fechaInicio);
    const fin = normalizeDateValue(fechaFin);
    if (!inicio || !fin || fin < inicio) return 0;

    const cache = holidayMap || {};
    let count = 0;
    const cursor = new Date(inicio);
    let d = new Date(cursor);

    while (true) {
        if (d > fin) break;

        const day = d.getDay();
        if (day === 0 || day === 6) {
            d.setDate(d.getDate() + 1);
            continue;
        }
        const ymd = toYmd(d);
        const year = d.getFullYear();
        const holidays = cache[year] || getFestivosColombia(year);
        if (holidays.has(ymd)) {
            d.setDate(d.getDate() + 1);
            continue;
        }
        count += 1;
        d.setDate(d.getDate() + 1);
    }
    return count;
}

function contarDiasHabilesTranscurridos(fechaTermino, fechaActual) {
    const inicio = normalizeDateValue(fechaTermino);
    const fin = normalizeDateValue(fechaActual);
    if (!inicio || !fin) return 0;
    if (fin < inicio) return 0;
    if (fin.getTime() === inicio.getTime()) return 0;

    const holidayMap = {};
    let count = 0;
    // CORRECCIÓN: empezar DESPUÉS de la fecha de término
    let cursor = new Date(inicio);
    cursor.setDate(cursor.getDate() + 1);

    let d = new Date(cursor);
    while (true) {
        if (d > fin) break;

        const day = d.getDay();
        if (day === 0 || day === 6) {
            d.setDate(d.getDate() + 1);
            continue;
        }
        const ymd = toYmd(d);
        const year = d.getFullYear();
        if (!holidayMap[year]) holidayMap[year] = getFestivosColombia(year);
        if (holidayMap[year].has(ymd)) {
            d.setDate(d.getDate() + 1);
            continue;
        }
        count += 1;
        d.setDate(d.getDate() + 1);
    }
    return count;
}


function hasExplicitNovedad(caso) {
    const values = [
        caso?.motivo_novedad,
        caso?.novedad,
        caso?.motivo,
        caso?.observacion_inconsistente,
        caso?.error,
        caso?.motivo_error
    ];
    if (values.some((v) => typeof v === 'string' && v.trim().length > 0)) {
        return true;
    }
    if (caso?.sin_gp === true || caso?.gp_asignado_id == null || caso?.gp_user_id == null) {
        return true;
    }
    if (caso?.colaborador_existe === false) {
        return true;
    }
    const faltanDatos = [
        caso?.cliente_destino,
        caso?.causal,
        caso?.fecha_fin
    ].some((v) => !v || String(v).trim() === '');
    if (faltanDatos) return true;
    return false;
}

function calcularEstado(casoOrFecha, novedad = null, fechaActual = new Date()) {
    const isRawDateInput = !(
        casoOrFecha &&
        typeof casoOrFecha === 'object' &&
        !Array.isArray(casoOrFecha) &&
        !(casoOrFecha instanceof Date)
    );

    const caso = isRawDateInput
        ? {
              fecha_fin: casoOrFecha,
              motivo_novedad: novedad,
              fecha_actual: fechaActual
          }
        : casoOrFecha;

    const fechaHoy = normalizeDateValue(caso?.fecha_actual ?? fechaActual) || new Date();
    fechaHoy.setHours(0, 0, 0, 0);

    const motivoNovedad = caso?.motivo_novedad ?? caso?.novedad ?? caso?.motivo ?? novedad;
    const fechaFin = normalizeDateValue(caso?.fecha_fin ?? caso?.fechaTermino ?? caso?.fecha_termino);
    if (motivoNovedad && String(motivoNovedad).trim().length > 0) {
        return {
            estado: ESTADOS.CON_NOVEDAD,
            diasTranscurridos: 0,
            semaforo: null,
            motivo: String(motivoNovedad).trim()
        };
    }

    if (!fechaFin) {
        return {
            estado: ESTADOS.CON_NOVEDAD,
            diasTranscurridos: 0,
            semaforo: null,
            motivo: 'Fecha de término inválida'
        };
    }

    if (caso?.colaborador_existe === false) {
        return {
            estado: ESTADOS.CON_NOVEDAD,
            diasTranscurridos: 0,
            semaforo: null,
            motivo: 'Colaborador no encontrado'
        };
    }

    if (!isRawDateInput && (caso?.sin_gp === true || (!caso?.gp_user_id && !caso?.gp_asignado_id))) {
        return {
            estado: ESTADOS.CON_NOVEDAD,
            diasTranscurridos: 0,
            semaforo: null,
            motivo: 'Sin GP asignado'
        };
    }

    if (!caso?.cliente_destino || String(caso.cliente_destino).trim() === '') {
    return {
        estado: ESTADOS.CON_NOVEDAD,
        diasTranscurridos: 0,
        semaforo: null,
        motivo: 'Faltan datos de cliente destino'
    };
}

    if (fechaFin > fechaHoy) {
        const diasRestantes = contarDiasHabilesColombia(fechaHoy, fechaFin);
        return {
            estado: ESTADOS.PENDIENTE,
            diasTranscurridos: 0,
            dias_restantes: diasRestantes,
            semaforo: semaforoFromDiasRestantes(diasRestantes),
            motivo: null
        };
    }

    const diasTranscurridos = contarDiasHabilesTranscurridos(fechaFin, fechaHoy);
    const diasRestantesCalendario = Math.ceil((fechaFin.getTime() - fechaHoy.getTime()) / 86400000);
    if (diasRestantesCalendario <= -6) {
        return {
            estado: ESTADOS.VENCIDO,
            diasTranscurridos,
            dias_restantes: diasRestantesCalendario,
            semaforo: 'Vencido',
            motivo: 'Movimiento automático por vencimiento de fecha de decisión'
        };
    }

    return {
        estado: ESTADOS.EN_PROCESO,
        diasTranscurridos,
        dias_restantes: 0,
        semaforo: 'Rojo',
        motivo: null
    };
}

function obtenerDescripcionEstado(estado, diasTranscurridos) {
    if (estado === ESTADOS.PENDIENTE) return 'Pendiente';
    if (estado === ESTADOS.EN_PROCESO) return `En proceso (día ${diasTranscurridos ?? 0})`;
    if (estado === ESTADOS.CON_NOVEDAD) return 'Con novedad';
    if (estado === ESTADOS.VENCIDO) return 'Vencido';
    if (estado === ESTADOS.RESUELTO) return 'Resuelto';
    return estado;
}


async function registrarCambioEstadoHistorial({
    pipeline_id,
    estado_anterior,
    estado_nuevo,
    motivo,
    pool
}) {
    try {
        // Obtener consultor_id del caso
        const casoRes = await pool.query(
            `SELECT consultor_id FROM reubicaciones_pipeline WHERE id = $1`,
            [pipeline_id]
        );
        const consultor_id = casoRes.rows[0]?.consultor_id || null;

        await pool.query(
            `INSERT INTO reubicaciones_historial (
                caso_id,
                consultor_id,
                tipo,
                origen,
                descripcion,
                before_data,
                after_data,
                fecha
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
                pipeline_id,
                consultor_id,
                'cambio_estado',
                'SISTEMA',
                motivo || `Cambio de estado: ${estado_anterior || 'Nuevo'} → ${estado_nuevo}`,
                estado_anterior ? JSON.stringify({ estado: estado_anterior }) : null,
                JSON.stringify({ estado: estado_nuevo })
            ]
        );
    } catch (histError) {
        console.warn('⚠️ No se pudo guardar cambio de estado en reubicaciones_historial:', histError.message);
    }
}

module.exports = {
    ESTADOS,
    calcularEstado,
    obtenerDescripcionEstado,
    contarDiasHabilesColombia,
    contarDiasHabilesTranscurridos,
    normalizeDateValue,
    registrarCambioEstadoHistorial 
};