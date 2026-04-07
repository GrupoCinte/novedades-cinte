/** Texto tipo moneda COP: miles con punto, decimales con coma (es-CO). */
export function formatSalarioMoneda(n) {
    if (n === null || n === undefined) return '';
    const num = Number(n);
    if (!Number.isFinite(num)) return '';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(num);
}

/** Formatea un valor monetario según la moneda (COP, USD, CLP). */
export function formatMoney(value, moneda = 'COP') {
    const n = Number(value || 0);
    if (moneda === 'USD') return `US$ ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (moneda === 'CLP') return `CLP ${Math.round(n).toLocaleString('es-CL')}`;
    return `$ ${Math.round(n).toLocaleString('es-CO')}`;
}

/** Convierte lo escrito a string numérico para el backend ("1234567" o "1234567.5"). */
export function parseSalarioLoose(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    let t = s.replace(/[^\d.,\-]/g, '');
    if (!t) return '';
    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        if (lastComma > lastDot) {
            t = t.replace(/\./g, '').replace(',', '.');
        } else {
            t = t.replace(/,/g, '');
        }
    } else if (lastComma >= 0) {
        const parts = t.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
            t = parts[0].replace(/\./g, '') + '.' + parts[1];
        } else {
            t = t.replace(/,/g, '');
        }
    } else {
        t = t.replace(/\./g, '');
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return '';
    return String(n);
}
