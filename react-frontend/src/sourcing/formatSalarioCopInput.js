/** Formateo visual COP (miles con punto) para inputs y chips. */

function formatNumberPart(digits) {
    const n = String(digits || '').replace(/\D/g, '');
    if (!n) return '';
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatea texto de salario mientras el usuario escribe (soporta rangos con " - "). */
export function formatSalarioCopInput(raw) {
    const text = String(raw || '');
    if (!text.trim()) return '';
    return text
        .split(',')
        .map((part) => {
            const trimmed = part.trim();
            if (!trimmed) return '';
            const rangeMatch = trimmed.match(/^(.+?)\s*-\s*(.+)$/);
            if (rangeMatch) {
                const a = formatNumberPart(rangeMatch[1]);
                const b = formatNumberPart(rangeMatch[2]);
                if (a && b) return `${a} - ${b}`;
                if (a) return `${a} - `;
                return formatNumberPart(trimmed);
            }
            return formatNumberPart(trimmed);
        })
        .filter(Boolean)
        .join(', ');
}

/** Convierte input formateado a array de rangos para salario_rangos_cop. */
export function parseSalarioCopRanges(formatted) {
    return String(formatted || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
}

/** Display en chips con prefijo $. */
export function displaySalarioCop(ranges) {
    const arr = Array.isArray(ranges) ? ranges : [];
    if (!arr.length) return '';
    return arr.map((r) => {
        const t = String(r).trim();
        return t.startsWith('$') ? t : `$ ${t}`;
    }).join(' / ');
}
