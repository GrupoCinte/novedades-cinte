/**
 * Entrada tipo Colombia: miles con punto, decimales con coma (ej. 1.250.000,50).
 * Acepta prefijo $ y espacios.
 */
export function parseMontoCOPInput(str) {
    const raw = String(str || '')
        .replace(/\$/g, '')
        .replace(/\s/g, '')
        .trim();
    if (!raw) return null;
    const lastComma = raw.lastIndexOf(',');
    let normalized;
    if (lastComma >= 0) {
        const whole = raw.slice(0, lastComma).replace(/\./g, '').replace(/[^\d]/g, '');
        const frac = raw.slice(lastComma + 1).replace(/[^\d]/g, '').slice(0, 2);
        if (!whole && !frac) return null;
        normalized = frac !== '' ? `${whole || '0'}.${frac}` : whole;
    } else {
        /* Sin coma: los puntos son separadores de miles (formato CO). */
        normalized = raw.replace(/\./g, '').replace(/[^\d]/g, '');
    }
    if (normalized === '' || normalized === '.') return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

/** Muestra en pesos colombianos (símbolo y agrupación es-CO). */
export function formatMontoCOPLocale(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '$ 0';
    if (v === 0) return '$ 0';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(v);
}
