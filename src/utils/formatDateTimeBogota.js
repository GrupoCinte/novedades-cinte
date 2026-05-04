/**
 * Fecha y hora en zona America/Bogota (misma idea que listados de novedades en es-CO).
 * @param {Date|string|number|undefined} input
 * @returns {string}
 */
function formatDateTimeBogota(input) {
    const d =
        input instanceof Date
            ? input
            : input != null && input !== ''
              ? new Date(input)
              : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);
}

module.exports = { formatDateTimeBogota };
