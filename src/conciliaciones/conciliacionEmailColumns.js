'use strict';

const CONCILIACION_EMAIL_COLUMNS = [
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

const COLUMN_KEYS = new Set(CONCILIACION_EMAIL_COLUMNS.map((c) => c.key));

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatCop(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(Number(n) || 0);
}

function monthLabel(anio, mes) {
    const names = [
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
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${names[m - 1]} de ${Number(anio) || ''}`.trim();
}

function monthLabelShort(anio, mes) {
    const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${names[m - 1]} ${anio}`;
}

function getDefaultSelectedColumnKeys() {
    return CONCILIACION_EMAIL_COLUMNS.filter((c) => c.defaultSelected).map((c) => c.key);
}

function normalizeColumnKeys(columnas) {
    const raw =
        Array.isArray(columnas) && columnas.length ? columnas : getDefaultSelectedColumnKeys();
    const out = [];
    const seen = new Set();
    for (const key of raw) {
        const k = String(key || '').trim();
        if (!COLUMN_KEYS.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}

/** Formatea creado_en en America/Bogota: dd/mm/yyyy HH:mm */
function formatCreadoEnBogota(isoOrDate) {
    if (!isoOrDate) return '';
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    if (!day || !month || !year) return '';
    return `${day}/${month}/${year} ${hour}:${minute}`;
}

/**
 * Líneas de texto para la celda Novedades (una por carga).
 * Prefiere novedadesDetalle; fallback a tipos únicos / count.
 */
function formatNovedadesCellLines(row) {
    const detalle = Array.isArray(row?.novedadesDetalle) ? row.novedadesDetalle : [];
    if (detalle.length) {
        return detalle
            .map((d) => {
                const tipo = String(d?.tipo || '').trim();
                if (!tipo) return '';
                const when = formatCreadoEnBogota(d?.creadoEn || d?.creado_en);
                return when ? `${tipo} · ${when}` : tipo;
            })
            .filter(Boolean);
    }
    const raw = row?.novedadesTipos;
    if (Array.isArray(raw)) {
        const tipos = raw.map((t) => String(t || '').trim()).filter(Boolean);
        if (tipos.length) return [tipos.join(', ')];
    } else {
        const asText = String(raw || '').trim();
        if (asText) return [asText];
    }
    const cnt = Number(row?.novedadesCount) || 0;
    if (cnt > 0) return [`${cnt} aprobada${cnt === 1 ? '' : 's'}`];
    return ['Sin novedades'];
}

function formatCellValue(row, col) {
    const key = col.key;
    if (key === 'diasFacturables') {
        const dias = row?.diasFacturables;
        const diasMes = row?.diasMes;
        if (row?.prorrateoAplicado && diasMes != null && diasMes !== '') {
            return `${dias ?? ''}/${diasMes}`;
        }
        if (dias != null && dias !== '') return String(dias);
        if (diasMes != null && diasMes !== '') return String(diasMes);
        return '';
    }
    if (key === 'novedadesTipos') {
        return formatNovedadesCellLines(row).join('\n');
    }
    const val = row?.[key];
    if (col.format === 'cop') return formatCop(val);
    return val != null && val !== '' ? String(val) : '';
}

function buildConciliacionEmailTableHtml(rows, columnKeys) {
    const keys = normalizeColumnKeys(columnKeys);
    if (!keys.length) return '';

    const cols = keys
        .map((k) => CONCILIACION_EMAIL_COLUMNS.find((c) => c.key === k))
        .filter(Boolean);

    const head = cols.map((c) => `<th style="padding:8px 10px;text-align:left;border:1px solid #cbd5e1;background:#f1f5f9;font-size:12px;">${escapeHtml(c.label)}</th>`).join('');

    const body = (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const cells = cols
                .map((c) => {
                    let inner;
                    if (c.key === 'novedadesTipos') {
                        inner = formatNovedadesCellLines(row).map(escapeHtml).join('<br>');
                    } else {
                        inner = escapeHtml(formatCellValue(row, c));
                    }
                    return `<td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:12px;color:#334155;">${inner}</td>`;
                })
                .join('');
            return `<tr>${cells}</tr>`;
        })
        .join('');

    return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-family:Arial,sans-serif;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function applyTemplateVars(template, vars) {
    let out = String(template || '');
    for (const [key, value] of Object.entries(vars || {})) {
        out = out.split(`{${key}}`).join(String(value ?? ''));
    }
    return out;
}

const DEFAULT_ASUNTO_TEMPLATE = 'Conciliación {servicio} — {mes}';
const DEFAULT_INTRO_TEMPLATE =
    'Estimado/a {nombreLider},\n\nA continuación adjuntamos la conciliación para el mes de {mes}.';
const DEFAULT_CIERRE_TEMPLATE = 'Saludos cordiales,\nEquipo de Conciliaciones — Grupo Cinte';

module.exports = {
    CONCILIACION_EMAIL_COLUMNS,
    COLUMN_KEYS,
    getDefaultSelectedColumnKeys,
    normalizeColumnKeys,
    buildConciliacionEmailTableHtml,
    applyTemplateVars,
    monthLabel,
    monthLabelShort,
    formatCop,
    escapeHtml,
    formatCreadoEnBogota,
    formatNovedadesCellLines,
    formatCellValue,
    DEFAULT_ASUNTO_TEMPLATE,
    DEFAULT_INTRO_TEMPLATE,
    DEFAULT_CIERRE_TEMPLATE
};
