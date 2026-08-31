const ESTADOS = {
    PENDIENTE: 'Pendiente',
    EN_PROCESO: 'En proceso',
    CON_NOVEDAD: 'Con novedad'
};

/**
 * Calcula el estado de una reubicación (HU-02)
 * Se recibe como un objeto para facilitar la inyección desde sincronizarConPipeline
 * @param {Object} args
 * @param {string|Date} args.fecha_fin - Fecha en la que el consultor sale de su proyecto
 * @param {string} args.novedad - Si existe un motivo de novedad previo o calculado (ej: falta cliente)
 * @param {string|Date} [args.fecha_actual] - Fecha base para el cálculo (default: hoy)
 * @returns {Object} { estado, motivo }
 */
function calcularEstado({ fecha_fin, novedad = null, fecha_actual = new Date() }) {
    if (novedad) {
        return {
            estado: ESTADOS.CON_NOVEDAD,
            motivo: novedad
        };
    }

    const fin = new Date(fecha_fin);
    const hoy = new Date(fecha_actual);
    
    // Si la fecha es inválida, no se puede calcular pendiente o proceso, dejamos En Proceso por defecto
    if (Number.isNaN(fin.getTime()) || Number.isNaN(hoy.getTime())) {
        return { estado: ESTADOS.EN_PROCESO, motivo: null };
    }
    
    // Normalizar horas para comparar solo fechas
    fin.setHours(0, 0, 0, 0);
    hoy.setHours(0, 0, 0, 0);

    if (fin > hoy) {
        return {
            estado: ESTADOS.PENDIENTE,
            motivo: null
        };
    }

    return {
        estado: ESTADOS.EN_PROCESO,
        motivo: null
    };
}

module.exports = {
    ESTADOS,
    calcularEstado
};
