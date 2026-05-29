/**
 * Convierte un Date válido a cadena SQL `yyyy-MM-dd` (UTC).
 * @param {Date|null|undefined} date
 * @returns {string|null}
 */
function dateToSqlDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Serial de Excel (sistema 1900) → Date en medianoche UTC.
 * Incluye corrección del bug histórico de Excel (1900-02-29).
 * @param {number} serial
 * @returns {Date|null}
 */
function excelSerialToDateUtc(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    const days = Math.floor(n);
    if (days <= 0) return null;
    const excelEpochUtcMs = Date.UTC(1899, 11, 30);
    const correctedDays = days >= 60 ? days - 1 : days;
    return new Date(excelEpochUtcMs + correctedDays * 86400000);
}

/**
 * Parsea celda de fecha fin del pipeline Excel (serial numérico o `dd/mm/yyyy`).
 * @param {number|string|null|undefined} value
 * @returns {Date|null}
 */
function parseFechaFinCell(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return excelSerialToDateUtc(value);

    const s = String(value).trim();
    if (!s) return null;

    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
    if (yyyy < 1900 || yyyy > 9999) return null;
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;

    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
    return d;
}

module.exports = {
    parseFechaFinCell,
    dateToSqlDate
};
