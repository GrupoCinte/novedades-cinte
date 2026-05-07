/** Códigos API y etiquetas de negocio (alineado con ReubicacionesPipelinePage). */
export const SEMAFORO_ORDER = ['Verde', 'Amarillo', 'Rojo', 'Vencido'];

export const SEMAFORO_LABEL = {
    Verde: 'Proyectado',
    Amarillo: 'En riesgo',
    Rojo: 'Urgente',
    Vencido: 'Vencido'
};

/** Colores para gráficos (semántica semáforo). */
export const SEMAFORO_CHART_COLOR = {
    Verde: '#10b981',
    Amarillo: '#f59e0b',
    Rojo: '#ef4444',
    Vencido: '#b91c1c'
};

/**
 * Series para pie/donut: una entrada por código conocido (valor puede ser 0).
 * @param {Array<{ semaforo?: string }>} items
 */
export function aggregateSemaforoReubicaciones(items) {
    const counts = { Verde: 0, Amarillo: 0, Rojo: 0, Vencido: 0 };
    for (const row of Array.isArray(items) ? items : []) {
        const s = String(row?.semaforo || '');
        if (Object.prototype.hasOwnProperty.call(counts, s)) counts[s] += 1;
    }
    return SEMAFORO_ORDER.map((key) => ({
        key,
        name: SEMAFORO_LABEL[key],
        value: counts[key]
    }));
}

/**
 * @param {Array<{ tipo_contrato?: string | null }>} colaboradoresRows
 * @returns {{ name: string, value: number }[]}
 */
export function aggregateTipoContrato(colaboradoresRows) {
    const map = new Map();
    for (const r of Array.isArray(colaboradoresRows) ? colaboradoresRows : []) {
        const raw = String(r?.tipo_contrato ?? '').trim();
        const name = raw || 'Sin clasificar';
        map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
}

/**
 * @param {Array<{ cliente?: string | null }>} rows
 */
export function topClientesPorConsultores(rows, n = 12) {
    const lim = Math.max(1, Number(n) || 12);
    const map = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
        const c = String(r?.cliente ?? '').trim() || 'Sin cliente';
        map.set(c, (map.get(c) || 0) + 1);
    }
    return Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, lim);
}

const MONTH_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatMonthKeyLabel(ym) {
    const s = String(ym || '');
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return s;
    const mi = Number(m[2]) - 1;
    if (mi < 0 || mi > 11) return s;
    return `${MONTH_SHORT_ES[mi]} ${m[1]}`;
}

/**
 * Agrupa fecha_fin por año-mes (YYYY-MM).
 * @param {Array<{ fecha_fin?: string | null }>} items
 */
export function aggregateReubicacionesPorMesFechaFin(items) {
    const map = new Map();
    for (const row of Array.isArray(items) ? items : []) {
        const fd = row?.fecha_fin;
        if (fd == null || fd === '') continue;
        const ymd = typeof fd === 'string' ? fd.slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
        const ym = ymd.slice(0, 7);
        map.set(ym, (map.get(ym) || 0) + 1);
    }
    return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({
            month,
            label: formatMonthKeyLabel(month),
            count
        }));
}

/**
 * @param {Array<{ cliente?: string, active_count?: number }>} clientesResumenRows
 */
export function topCatalogClientesByActiveCount(clientesResumenRows, n = 12) {
    const lim = Math.max(1, Number(n) || 12);
    return [...(Array.isArray(clientesResumenRows) ? clientesResumenRows : [])]
        .map((r) => ({
            name: String(r?.cliente ?? '').trim() || '—',
            value: Number(r?.active_count) || 0
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, lim);
}

export function countReubicacionesEnRiesgo(items) {
    let n = 0;
    for (const row of Array.isArray(items) ? items : []) {
        const s = String(row?.semaforo || '');
        if (s === 'Amarillo' || s === 'Rojo' || s === 'Vencido') n += 1;
    }
    return n;
}

/**
 * @param {Array<{ activo?: boolean }>} rows
 */
/** Primer y último día calendario del mes `yyyy-mm` (para filtros de fecha fin). */
export function monthCalendarRangeFromYm(ym) {
    const s = String(ym || '').trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return { desde: '', hasta: '' };
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return { desde: '', hasta: '' };
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, mo, 0).getDate();
    return {
        desde: `${y}-${pad(mo)}-01`,
        hasta: `${y}-${pad(mo)}-${pad(lastDay)}`
    };
}

export function countConsultoresByActivo(rows) {
    let activos = 0;
    let inactivos = 0;
    for (const r of Array.isArray(rows) ? rows : []) {
        if (r?.activo === true) activos += 1;
        else inactivos += 1;
    }
    return { activos, inactivos };
}
