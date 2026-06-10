export function displayFacturacionValue(row, col) {
    if (!row || !col) return '—';
    const val = row[col.key];
    if (val === null || val === undefined || val === '') return '—';
    if (col.numeric) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    }
    return String(val);
}
