function parseDateLocal(val) {
    if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    const str = String(val).slice(0, 10);
    const parts = str.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(val);
}

/**
 * Calcula la cantidad de días hábiles transcurridos desde una fecha de término hasta una fecha actual.
 * - Sábados, domingos y festivos no cuentan.
 * - El mismo día de la fechaFin es el "Día 0" (devuelve 0).
 * - Si fechaActual es menor que fechaFin, devuelve 0 (fechas futuras).
 * 
 * @param {string|Date} fechaFin - Fecha en que finaliza la reubicación (Día 0)
 * @param {string|Date} fechaActual - Fecha hasta la cual calcular
 * @param {Set<string>} festivosSet - Set de fechas festivas en formato 'YYYY-MM-DD'
 * @returns {number} Días hábiles transcurridos
 */
function diasHabilesTranscurridos(fechaFin, fechaActual, festivosSet) {
    if (!festivosSet || typeof festivosSet.has !== 'function') {
        throw new Error("Se requiere un festivosSet válido");
    }

    const start = parseDateLocal(fechaFin);
    const end = parseDateLocal(fechaActual);

    // Si las fechas son inválidas, devuelve 0 por seguridad
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 0;
    }

    // Normalizar horas al inicio del día en hora local (America/Bogota asumido por el Node si TZ está seteada, 
    // pero con setHours(0,0,0,0) nos basta para ignorar horas y comparar días estrictos)
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Salida futura o mismo día (Día 0)
    if (start >= end) {
        return 0;
    }

    let count = 0;
    
    // El conteo inicia desde el día siguiente a fechaFin
    const current = new Date(start);
    current.setDate(current.getDate() + 1);

    while (current <= end) {
        const dia = current.getDay(); // 0=domingo, 6=sábado
        const ymd = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;

        // Es hábil si es Lunes a Viernes y no está en los festivos
        if (dia >= 1 && dia <= 5 && !festivosSet.has(ymd)) {
            count++;
        }
        
        current.setDate(current.getDate() + 1);
    }

    return count;
}

module.exports = {
    diasHabilesTranscurridos
};
