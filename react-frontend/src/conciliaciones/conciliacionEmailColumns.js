export const CONCILIACION_EMAIL_COLUMNS = [
    { key: 'cedula', label: 'Cédula', defaultSelected: true },
    { key: 'nombre', label: 'Nombre', defaultSelected: true },
    { key: 'lider', label: 'Líder', defaultSelected: false },
    { key: 'tarifaMaestro', label: 'Tarifa catálogo', defaultSelected: true, format: 'cop' },
    { key: 'diasFacturables', label: 'Días fact.', defaultSelected: true },
    { key: 'tarifaCliente', label: 'Tarifa prorrateada', defaultSelected: true, format: 'cop' },
    { key: 'novedadesSumCop', label: 'Deducción', defaultSelected: true, format: 'cop' },
    { key: 'novedadesSumaCop', label: 'Incremento', defaultSelected: true, format: 'cop' },
    { key: 'novedadesTipos', label: 'Novedades', defaultSelected: true },
    { key: 'facturaCop', label: 'Factura neta', defaultSelected: true, format: 'cop' },
    { key: 'estado', label: 'Estado', defaultSelected: false },
    { key: 'facturaFv', label: 'FV', defaultSelected: false }
];

const MONTH_NAMES = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre'
];

export function getDefaultSelectedColumnKeys() {
    return CONCILIACION_EMAIL_COLUMNS.filter((c) => c.defaultSelected).map((c) => c.key);
}

export function monthLabelLong(anio, mes) {
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${MONTH_NAMES[m - 1]} de ${Number(anio) || ''}`.trim();
}

export function applyTemplateVars(template, vars) {
    let out = String(template || '');
    for (const [key, value] of Object.entries(vars || {})) {
        out = out.split(`{${key}}`).join(String(value ?? ''));
    }
    return out;
}

function formatCop(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(Number(n) || 0);
}

function formatCellValue(row, col) {
    const key = col.key;
    if (key === 'diasFacturables') {
        if (row?.prorrateoAplicado) {
            return `${row.diasFacturables ?? ''}/${row.diasMes ?? ''}`;
        }
        return row?.diasMes != null ? String(row.diasMes) : '';
    }
    if (key === 'novedadesTipos') {
        const raw = row?.novedadesTipos;
        if (Array.isArray(raw)) {
            const tipos = raw.map((t) => String(t || '').trim()).filter(Boolean);
            return tipos.length ? tipos.join(', ') : 'Sin novedades';
        }
        const asText = String(raw || '').trim();
        return asText || 'Sin novedades';
    }
    const val = row?.[key];
    if (col.format === 'cop') return formatCop(val);
    return val != null && val !== '' ? String(val) : '';
}

export function buildPreviewTableHtml(rows, columnKeys) {
    const cols = columnKeys
        .map((k) => CONCILIACION_EMAIL_COLUMNS.find((c) => c.key === k))
        .filter(Boolean);
    if (!cols.length) return '';

    const head = cols.map((c) => `<th class="px-2 py-1 text-left font-semibold">${c.label}</th>`).join('');
    const body = (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const cells = cols.map((c) => `<td class="px-2 py-1">${formatCellValue(row, c)}</td>`).join('');
            return `<tr class="border-t border-slate-200">${cells}</tr>`;
        })
        .join('');

    return `<table class="w-full text-xs"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
