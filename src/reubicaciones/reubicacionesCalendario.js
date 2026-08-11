const { isFestivo, getFestivosSet } = require('../festivosService');

/**
 * Calcula la cantidad de días hábiles entre dos fechas
 * (sin contar sábados, domingos y festivos)
 */
async function diasHabilesEntre(fechaInicio, fechaFin) {
    const festivos = await getFestivosSet();
    let count = 0;
    const current = new Date(fechaInicio);
    const end = new Date(fechaFin);

    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
        const dia = current.getDay(); // 0=domingo, 6=sábado
        const ymd = current.toISOString().split('T')[0];

        if (dia >= 1 && dia <= 5 && !festivos.has(ymd)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return count;
}

/**
 * Días hábiles transcurridos desde la fecha de término hasta hoy
 */
async function diasHabilesTranscurridos(fechaTermino, fechaActual = new Date()) {
    const inicio = new Date(fechaTermino);
    const fin = new Date(fechaActual);
    if (inicio > fin) return 0;
    return await diasHabilesEntre(inicio, fin);
}

/**
 * Suma N días hábiles a una fecha
 */
async function sumarDiasHabiles(fechaInicio, cantidad) {
    const festivos = await getFestivosSet();
    const current = new Date(fechaInicio);
    current.setHours(0, 0, 0, 0);

    let agregados = 0;
    while (agregados < cantidad) {
        current.setDate(current.getDate() + 1);
        const dia = current.getDay();
        const ymd = current.toISOString().split('T')[0];

        if (dia >= 1 && dia <= 5 && !festivos.has(ymd)) {
            agregados++;
        }
    }

    return current;
}

module.exports = {
    diasHabilesEntre,
    diasHabilesTranscurridos,
    sumarDiasHabiles
};