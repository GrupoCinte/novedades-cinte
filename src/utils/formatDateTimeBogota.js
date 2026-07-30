/**
 * Fecha y hora en zona America/Bogota (misma idea que listados de novedades en es-CO).
 * @param {Date|string|number|undefined} input
 * @returns {string}
 */
function toValidDate(input) {
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
    if (input == null || input === '') return null;
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTimeBogota(input) {
    const d = toValidDate(input) || new Date();
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

/** Fecha calendario Bogotá: dd/mm/yyyy */
function formatDateBogota(input) {
    const d = toValidDate(input);
    if (!d) return '';
    const parts = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    if (!day || !month || !year) return '';
    return `${day}/${month}/${year}`;
}

/** Hora Bogotá: HH:mm (o HH:mm:ss si withSeconds). */
function formatTimeBogota(input, { withSeconds = false } = {}) {
    const d = toValidDate(input);
    if (!d) return '';
    const parts = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' } : {}),
        hour12: false
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const hour = get('hour');
    const minute = get('minute');
    if (!hour || !minute) return '';
    if (withSeconds) {
        const second = get('second') || '00';
        return `${hour}:${minute}:${second}`;
    }
    return `${hour}:${minute}`;
}

/** Horario Bogotá: HH:mm:ss - HH:mm:ss (preciso para cronómetro). */
function formatScheduleBogota(inicio, fin) {
    const start = formatTimeBogota(inicio, { withSeconds: true });
    const end = formatTimeBogota(fin, { withSeconds: true });
    if (start && end) return `${start} - ${end}`;
    return start || end || '';
}

module.exports = {
    formatDateTimeBogota,
    formatDateBogota,
    formatTimeBogota,
    formatScheduleBogota
};
