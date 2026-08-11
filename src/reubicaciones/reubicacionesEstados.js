const { diasHabilesTranscurridos } = require('./reubicacionesCalendario');
const { semaforoFromDiasRestantes } = require('./reubicacionesSemaforo');

const ESTADOS = {
    PENDIENTE: 'Pendiente',
    EN_PROCESO: 'En proceso',
    CON_NOVEDAD: 'Con novedad',
    RESUELTO: 'Resuelto'
};

/**
 * Calcula el estado del caso según fecha de término y novedad
 */
function calcularEstado(fechaTermino, novedad = null, fechaActual = new Date()) {
    // Si hay novedad → prevalece
    if (novedad) {
        return {
            estado: ESTADOS.CON_NOVEDAD,
            diasTranscurridos: 0,
            semaforo: null,
            motivo: novedad
        };
    }

    const fin = new Date(fechaTermino);
    const hoy = new Date(fechaActual);

    // Salida futura → Pendiente
    if (fin > hoy) {
        const diffDias = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
        return {
            estado: ESTADOS.PENDIENTE,
            diasTranscurridos: 0,
            semaforo: semaforoFromDiasRestantes(diffDias),
            motivo: null
        };
    }

    // Salida hoy o pasada → En proceso
    return {
        estado: ESTADOS.EN_PROCESO,
        diasTranscurridos: 0, // se actualizará después
        semaforo: 'Rojo',
        motivo: null
    };
}

/**
 * Obtiene la descripción del estado para mostrar en UI
 */
function obtenerDescripcionEstado(estado, diasTranscurridos) {
    if (estado === ESTADOS.PENDIENTE) return 'Pendiente';
    if (estado === ESTADOS.EN_PROCESO) return `En proceso (día ${diasTranscurridos})`;
    if (estado === ESTADOS.CON_NOVEDAD) return 'Con novedad';
    if (estado === ESTADOS.RESUELTO) return 'Resuelto';
    return estado;
}

module.exports = {
    ESTADOS,
    calcularEstado,
    obtenerDescripcionEstado
};