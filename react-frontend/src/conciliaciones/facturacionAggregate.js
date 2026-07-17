/** Estados de conciliación / facturación (alineado con backend Zod). */
export const ESTADOS_FACTURACION = ['PENDIENTE', 'APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'DEVUELTA', 'CONCILIADA'];

export const COLA_ESTADO_ORDER = {
    PENDIENTE: 0,
    DEVUELTA: 1,
    EN_REVISION: 2,
    CONCILIADA: 3,
    SIN_CONSULTORES: 4
};

export const COLA_ESTADO_LABELS = {
    PENDIENTE: 'Pendiente',
    EN_REVISION: 'En revisión',
    CONCILIADA: 'Conciliado',
    DEVUELTA: 'Con devoluciones',
    SIN_CONSULTORES: 'Sin consultores'
};

/** Colores donut salud de cola (alineados con ConciliacionesColaCierresCard). */
export const COLA_SALUD_CHART_COLORS = {
    PENDIENTE: '#f59e0b',
    EN_REVISION: '#2F7BB8',
    CONCILIADA: '#10b981',
    DEVUELTA: '#ef4444',
    SIN_CONSULTORES: '#64748b'
};

export const ALERTA_TIPO_LABELS = {
    devuelta: 'Con devoluciones',
    cierre_vencido: 'Cierre vencido',
    sin_consultores: 'Sin consultores',
    bajo_avance: 'Bajo avance',
    token_vencido: 'Correo líder vencido',
    token_por_vencer: 'Correo líder por vencer'
};

export const ALERTA_TIPO_ORDER = [
    'devuelta',
    'token_vencido',
    'cierre_vencido',
    'token_por_vencer',
    'sin_consultores',
    'bajo_avance'
];

/** Tipos de alerta que componen el gap de cierre financiero. */
export const GAP_CIERRE_ALERT_TIPOS = ['cierre_vencido', 'bajo_avance'];

export function normalizeCedula(value) {
    return String(value || '').replace(/\D/g, '');
}

export function countEstadosFromRows(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
        (acc, r) => {
            const est = r.estado || 'PENDIENTE';
            if (ESTADOS_FACTURACION.includes(est)) acc[est] = (acc[est] || 0) + 1;
            return acc;
        },
        { PENDIENTE: 0, APROBADO_ANALISTA: 0, APROBADO_FINANZAS: 0, DEVUELTA: 0, CONCILIADA: 0 }
    );
}

export function isColaboradorInactivoRow(row) {
    if (!row) return false;
    return row.activo === false || row.activoColaborador === false;
}

export function extractSalidasMesRows(allRows, cedulasServicio) {
    const inService = new Set((cedulasServicio || []).map(normalizeCedula).filter(Boolean));
    return (Array.isArray(allRows) ? allRows : []).filter(
        (r) => isColaboradorInactivoRow(r) && !inService.has(normalizeCedula(r.cedula))
    );
}

export function mergeConciliacionServicioRows(rows, cedulasServicio) {
    const set = new Set((cedulasServicio || []).map(normalizeCedula).filter(Boolean));
    const asociados = set.size
        ? (Array.isArray(rows) ? rows : []).filter((r) => set.has(normalizeCedula(r.cedula)))
        : [];
    const salidas = extractSalidasMesRows(rows, cedulasServicio);
    return [...asociados, ...salidas];
}

function aggregateConciliacionRows(filtered) {
    let tarifaSum = 0;
    let incrementoSum = 0;
    let deduccionSum = 0;
    let facturaSum = 0;
    let consultoresConNovedad = 0;
    let consultoresCerrados = 0;

    for (const r of filtered) {
        tarifaSum += Number(r.tarifaCliente) || 0;
        incrementoSum += Number(r.novedadesSumaCop) || 0;
        deduccionSum += Number(r.novedadesSumCop) || 0;
        facturaSum += Number(r.facturaCop) || 0;
        if ((r.novedadesCount || 0) > 0) consultoresConNovedad += 1;
        if (r.cerrado) consultoresCerrados += 1;
    }

    return {
        consultoresTotal: filtered.length,
        consultoresCerrados,
        consultoresConNovedad,
        estados: countEstadosFromRows(filtered),
        totales: { tarifaSum, incrementoSum, deduccionSum, facturaSum }
    };
}

/** Agrega métricas de cierre: asociados Dynamo + salidas del mes M del cliente. */
export function aggregateServicioCierre(rows, cedulas, lideresAsociados) {
    let filtered = mergeConciliacionServicioRows(rows, cedulas);
    filtered = filterRowsByServicioLideres(filtered, lideresAsociados, cedulas);
    return aggregateConciliacionRows(filtered);
}

/**
 * Estado derivado de la cola para filtros y ordenamiento.
 */
export function deriveEstadoCola(agg) {
    const { consultoresTotal, consultoresCerrados, estados } = agg || {};
    if (!consultoresTotal) return 'SIN_CONSULTORES';
    if ((estados?.DEVUELTA || 0) > 0) return 'DEVUELTA';
    const revisionOk =
        (estados?.APROBADO_ANALISTA || 0) +
            (estados?.APROBADO_FINANZAS || 0) +
            (estados?.CONCILIADA || 0) ===
        consultoresTotal;
    if (revisionOk) return 'CONCILIADA';
    if ((estados?.PENDIENTE || 0) > 0 || consultoresCerrados < consultoresTotal) return 'PENDIENTE';
    return 'EN_REVISION';
}

export function colaCierreProgress(agg) {
    const total = Number(agg?.consultoresTotal) || 0;
    if (!total) return 0;
    return Math.round(((Number(agg?.consultoresCerrados) || 0) / total) * 100);
}

/** Orden: más urgentes primero (menos cerrados, estados más críticos). */
export function sortColaCierresItems(items) {
    return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
        const oa = COLA_ESTADO_ORDER[a.estadoCola] ?? 99;
        const ob = COLA_ESTADO_ORDER[b.estadoCola] ?? 99;
        if (oa !== ob) return oa - ob;
        const pa = colaCierreProgress(a);
        const pb = colaCierreProgress(b);
        if (pa !== pb) return pa - pb;
        const clientCmp = String(a.client || '').localeCompare(String(b.client || ''), 'es', { sensitivity: 'base' });
        if (clientCmp !== 0) return clientCmp;
        return String(a.serviceName || '').localeCompare(String(b.serviceName || ''), 'es', { sensitivity: 'base' });
    });
}

export function filterColaCierresByEstado(items, estadoColaFilter) {
    const f = String(estadoColaFilter || '').trim();
    if (!f || f === 'TODOS') return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter((i) => i.estadoCola === f);
}

export function normalizeLideresList(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((l) => String(l || '').trim()).filter(Boolean))];
}

function normalizeCedulaKey(cedula) {
    return String(cedula || '').replace(/\D/g, '');
}

export function rowMatchesServicioLideres(row, lideresAsociados) {
    const allowed = normalizeLideresList(lideresAsociados);
    if (!allowed.length) return true;
    const lider = String(row?.lider || '').trim().toLowerCase();
    if (!lider) return false;
    return allowed.some((a) => a.toLowerCase() === lider);
}

export function filterRowsByServicioLideres(rows, lideresAsociados, consultoresAsociados = null) {
    const keep = new Set(
        (Array.isArray(consultoresAsociados) ? consultoresAsociados : [])
            .map(normalizeCedulaKey)
            .filter(Boolean)
    );
    return (Array.isArray(rows) ? rows : []).filter((r) => {
        const k = normalizeCedulaKey(r?.cedula);
        if (keep.size && k && keep.has(k)) return true;
        return rowMatchesServicioLideres(r, lideresAsociados);
    });
}

export function filterColaCierres(items, filters = {}) {
    let out = filterColaCierresByEstado(items, filters.fEstadoCola);
    const search = String(filters.fSearchCola || '').trim().toLowerCase();
    if (search) {
        out = out.filter(
            (i) =>
                String(i.client || '').toLowerCase().includes(search) ||
                String(i.serviceName || '').toLowerCase().includes(search)
        );
    }
    const lider = String(filters.fLiderCola || '').trim().toLowerCase();
    if (lider) {
        out = out.filter((i) => {
            const la = normalizeLideresList(i.lideresAsociados);
            if (la.length && la.some((l) => l.toLowerCase() === lider)) return true;
            const dist = Array.isArray(i.lideresDistintos) ? i.lideresDistintos : [];
            return dist.some((l) => String(l || '').trim().toLowerCase() === lider);
        });
    }
    const bm = String(filters.fBillingMode || '').trim();
    if (bm) out = out.filter((i) => String(i.billingMode || '') === bm);
    const bt = String(filters.fBillingType || '').trim();
    if (bt) out = out.filter((i) => String(i.billingType || '') === bt);
    const estServ = String(filters.fEstadoServicio || '').trim().toUpperCase();
    if (estServ) {
        out = out.filter((i) => String(i.estadoServicio || 'EN_REVISION').trim().toUpperCase() === estServ);
    }
    const seg = String(filters.fSeguimientoCola || '').trim().toUpperCase();
    if (seg === 'ESPERANDO_LIDER') {
        out = out.filter(isColaItemEsperandoLider);
    } else if (seg === 'CON_DEVOLUCIONES') {
        out = out.filter(isColaItemConDevoluciones);
    }
    return out;
}

export function isColaItemEsperandoLider(item) {
    const est = String(item?.estadoServicio || '').trim().toUpperCase();
    if (est !== 'ENVIADA') return false;
    if (item?.emailUsadoAt) return false;
    return true;
}

export function isColaItemConDevoluciones(item) {
    const estados = item?.estados || {};
    if ((Number(estados.DEVUELTA) || 0) > 0) return true;
    if ((Number(item?.liderDecisiones?.rechazados) || 0) > 0) return true;
    return false;
}

/** Agrupa ítems de cola (por servicio) en filas por cliente — mismo criterio que el dashboard backend. */
export function aggregateDashboardFromColaItems(items) {
    /** @type {Map<string, { cliente: string, totales: object, serviciosCount: number }>} */
    const byClient = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        const cl = String(item.client || '').trim();
        if (!cl) continue;
        const cur = byClient.get(cl) || {
            cliente: cl,
            totales: { tarifaSum: 0, incrementoSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0, conNovedad: 0 },
            serviciosCount: 0
        };
        const t = item.totales || {};
        cur.totales.tarifaSum += Number(t.tarifaSum) || 0;
        cur.totales.incrementoSum += Number(t.incrementoSum) || 0;
        cur.totales.deduccionSum += Number(t.deduccionSum) || 0;
        cur.totales.facturaSum += Number(t.facturaSum) || 0;
        cur.totales.colaboradores += Number(item.consultoresTotal) || 0;
        cur.totales.conNovedad += Number(item.consultoresConNovedad) || 0;
        cur.serviciosCount += 1;
        byClient.set(cl, cur);
    }
    const rows = [...byClient.values()].sort((a, b) =>
        String(a.cliente).localeCompare(String(b.cliente), 'es', { sensitivity: 'base' })
    );
    const globalTotales = rows.reduce(
        (acc, r) => ({
            tarifaSum: acc.tarifaSum + (Number(r.totales.tarifaSum) || 0),
            incrementoSum: acc.incrementoSum + (Number(r.totales.incrementoSum) || 0),
            deduccionSum: acc.deduccionSum + (Number(r.totales.deduccionSum) || 0),
            facturaSum: acc.facturaSum + (Number(r.totales.facturaSum) || 0),
            colaboradores: acc.colaboradores + (Number(r.totales.colaboradores) || 0),
            conNovedad: acc.conNovedad + (Number(r.totales.conNovedad) || 0)
        }),
        { tarifaSum: 0, incrementoSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0, conNovedad: 0 }
    );
    return {
        rows: rows.map(({ cliente, totales, serviciosCount }) => ({ cliente, totales, serviciosCount })),
        globalTotales,
        clientesCount: rows.length,
        serviciosCount: (Array.isArray(items) ? items : []).length
    };
}

/** Día de referencia dentro del mes seleccionado (para alertas de cierre vencido). */
export function referenceDayInSelectedMonth(year, month, now = new Date()) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 0;
    const nowY = now.getFullYear();
    const nowM = now.getMonth() + 1;
    if (y === nowY && m === nowM) return now.getDate();
    if (y < nowY || (y === nowY && m < nowM)) return new Date(y, m, 0).getDate();
    return 0;
}

/** Donut: servicios por estadoCola. */
export function buildColaSaludChartData(items) {
    const counts = {};
    for (const key of Object.keys(COLA_ESTADO_ORDER)) counts[key] = 0;
    for (const item of Array.isArray(items) ? items : []) {
        const k = item.estadoCola || 'PENDIENTE';
        if (counts[k] !== undefined) counts[k] += 1;
    }
    return Object.keys(COLA_ESTADO_ORDER)
        .sort((a, b) => COLA_ESTADO_ORDER[a] - COLA_ESTADO_ORDER[b])
        .filter((key) => counts[key] > 0)
        .map((key) => ({
            key,
            name: COLA_ESTADO_LABELS[key] || key,
            value: counts[key],
            fill: COLA_SALUD_CHART_COLORS[key] || '#64748b'
        }));
}

/** Barras apiladas tarifa/deducción/factura por cliente (top N). */
export function buildClienteStackedChartData(rows, limit = 12, shortLabelFn = null) {
    const short = shortLabelFn || ((label) => {
        const s = String(label || '').trim();
        if (s.length <= 14) return s;
        return `${s.slice(0, 12)}…`;
    });
    return [...(Array.isArray(rows) ? rows : [])]
        .map((r) => ({
            cliente: String(r.cliente || '').trim(),
            clienteShort: short(r.cliente),
            tarifa: Number(r.totales?.tarifaSum) || 0,
            deduccion: Number(r.totales?.deduccionSum) || 0,
            factura: Number(r.totales?.facturaSum) || 0
        }))
        .sort((a, b) => b.factura - a.factura || b.tarifa - a.tarifa)
        .slice(0, limit);
}

export function classifyEmailTokenAlert(item, now = new Date()) {
    const est = String(item?.estadoServicio || '').trim().toUpperCase();
    if (est !== 'ENVIADA' || item?.emailUsadoAt) return null;
    const expiraAt = item?.emailExpiraAt;
    if (!expiraAt) return null;
    const expMs = new Date(expiraAt).getTime();
    if (Number.isNaN(expMs)) return null;
    const nowMs = now.getTime();
    if (expMs < nowMs) return 'token_vencido';
    const hoursLeft = (expMs - nowMs) / (60 * 60 * 1000);
    if (hoursLeft <= 24) return 'token_por_vencer';
    return null;
}

function classifyItemAlert(item, refDay, now = new Date()) {
    const tokenAlert = classifyEmailTokenAlert(item, now);
    if (tokenAlert === 'token_vencido') return tokenAlert;
    const progress = colaCierreProgress(item);
    if (item.estadoCola === 'SIN_CONSULTORES') return 'sin_consultores';
    if (item.estadoCola === 'DEVUELTA') return 'devuelta';
    if (tokenAlert === 'token_por_vencer') return tokenAlert;
    const closingDay = Number(item.closingDay) || 0;
    if (
        (item.consultoresTotal || 0) > 0 &&
        progress < 100 &&
        refDay > 0 &&
        closingDay > 0 &&
        refDay > closingDay
    ) {
        return 'cierre_vencido';
    }
    if (item.estadoCola !== 'CONCILIADA' && progress < 50) return 'bajo_avance';
    return null;
}

/** Alertas operativas del mes (panel + mini gráfico). */
export function buildDashboardAlertas(items, { year, month, now = new Date() } = {}) {
    const refDay = referenceDayInSelectedMonth(year, month, now);
    const counts = {
        devuelta: 0,
        cierre_vencido: 0,
        sin_consultores: 0,
        bajo_avance: 0,
        token_vencido: 0,
        token_por_vencer: 0
    };
    const allEntries = [];

    for (const item of Array.isArray(items) ? items : []) {
        const tipo = classifyItemAlert(item, refDay, now);
        if (!tipo) continue;
        counts[tipo] += 1;
        allEntries.push({
            tipo,
            label: ALERTA_TIPO_LABELS[tipo],
            client: String(item.client || '').trim(),
            serviceName: String(item.serviceName || '').trim(),
            servicioId: item.servicioId || item.id || null,
            progress: colaCierreProgress(item)
        });
    }

    const severity = {
        token_vencido: 0,
        devuelta: 1,
        cierre_vencido: 2,
        token_por_vencer: 3,
        sin_consultores: 4,
        bajo_avance: 5
    };
    allEntries.sort((a, b) => severity[a.tipo] - severity[b.tipo] || a.progress - b.progress);

    const chartData = ALERTA_TIPO_ORDER.filter((tipo) => counts[tipo] > 0).map((tipo) => ({
        tipo,
        label: ALERTA_TIPO_LABELS[tipo],
        count: counts[tipo]
    }));

    return { counts, entries: allEntries.slice(0, 8), chartData };
}

const SERVICIO_ESTADO_SEGUIMIENTO = ['EN_REVISION', 'LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'];
const CONSULTOR_ESTADO_SEGUIMIENTO = [
    'PENDIENTE',
    'APROBADO_ANALISTA',
    'APROBADO_FINANZAS',
    'DEVUELTA',
    'CONCILIADA'
];

/** Resumen numérico para chips del dashboard (servicio + consultor + token). */
export function buildSeguimientoEstadoResumen(items, now = new Date()) {
    const porServicio = Object.fromEntries(SERVICIO_ESTADO_SEGUIMIENTO.map((k) => [k, 0]));
    const porConsultor = Object.fromEntries(CONSULTOR_ESTADO_SEGUIMIENTO.map((k) => [k, 0]));
    let enviadaVencida = 0;
    let esperandoLider = 0;

    for (const item of Array.isArray(items) ? items : []) {
        const est = String(item?.estadoServicio || 'EN_REVISION').trim().toUpperCase();
        if (porServicio[est] != null) porServicio[est] += 1;
        else porServicio.EN_REVISION += 1;

        const estados = item?.estados || {};
        for (const key of CONSULTOR_ESTADO_SEGUIMIENTO) {
            porConsultor[key] += Number(estados[key]) || 0;
        }

        if (isColaItemEsperandoLider(item)) {
            esperandoLider += 1;
            if (classifyEmailTokenAlert(item, now) === 'token_vencido') enviadaVencida += 1;
        }
    }

    return {
        porServicio,
        porConsultor,
        esperandoLider,
        enviadaVencida
    };
}

/** Facturación en riesgo por cierre vencido o bajo avance (gap de cierre). */
export function buildGapCierreChartData(items, { year, month, now = new Date() } = {}) {
    const refDay = referenceDayInSelectedMonth(year, month, now);
    let facturaTotal = 0;
    let facturaEnRiesgo = 0;
    const byTipo = {
        cierre_vencido: { count: 0, factura: 0 },
        bajo_avance: { count: 0, factura: 0 }
    };

    for (const item of Array.isArray(items) ? items : []) {
        const factura = Number(item.totales?.facturaSum) || 0;
        facturaTotal += factura;
        const tipo = classifyItemAlert(item, refDay);
        if (!GAP_CIERRE_ALERT_TIPOS.includes(tipo)) continue;
        facturaEnRiesgo += factura;
        byTipo[tipo].count += 1;
        byTipo[tipo].factura += factura;
    }

    const facturaSinGap = Math.max(0, facturaTotal - facturaEnRiesgo);
    const pctEnRiesgo = facturaTotal > 0 ? Math.round((facturaEnRiesgo / facturaTotal) * 1000) / 10 : 0;

    const segments = [{ key: 'sin_gap', label: 'Sin gap de cierre', factura: facturaSinGap, fill: '#10b981' }];
    for (const tipo of GAP_CIERRE_ALERT_TIPOS) {
        if (byTipo[tipo].factura > 0) {
            segments.push({
                key: tipo,
                label: ALERTA_TIPO_LABELS[tipo],
                factura: byTipo[tipo].factura,
                fill: tipo === 'cierre_vencido' ? '#f97316' : '#f59e0b'
            });
        }
    }

    return {
        facturaTotal,
        facturaEnRiesgo,
        facturaSinGap,
        pctEnRiesgo,
        byTipo,
        barRow: { label: 'Mes', sin_gap: facturaSinGap, cierre_vencido: byTipo.cierre_vencido.factura, bajo_avance: byTipo.bajo_avance.factura },
        segments
    };
}

/** Pareto de facturación neta por cliente (top N + % acumulado). */
export function buildParetoIngresosChartData(rows, limit = 12, shortLabelFn = null) {
    const short = shortLabelFn || ((label) => {
        const s = String(label || '').trim();
        if (s.length <= 14) return s;
        return `${s.slice(0, 12)}…`;
    });
    const allRows = Array.isArray(rows) ? rows : [];
    const grandTotal = allRows.reduce((s, r) => s + (Number(r.totales?.facturaSum) || 0), 0);
    const sorted = allRows
        .map((r) => ({
            cliente: String(r.cliente || '').trim(),
            factura: Number(r.totales?.facturaSum) || 0
        }))
        .filter((r) => r.cliente && r.factura > 0)
        .sort((a, b) => b.factura - a.factura || a.cliente.localeCompare(b.cliente, 'es'))
        .slice(0, limit);

    let cumulative = 0;
    return sorted.map((r, i) => {
        cumulative += r.factura;
        return {
            cliente: r.cliente,
            clienteShort: short(r.cliente),
            factura: r.factura,
            cumulativeFactura: cumulative,
            cumulativePct: grandTotal > 0 ? Math.round((cumulative / grandTotal) * 1000) / 10 : 0,
            rank: i + 1
        };
    });
}

/** Matriz cliente × día de cierre (intensidad = factura neta). */
export function buildClienteCierreHeatmapData(items, { maxClientes = 10, maxDay = 31 } = {}, shortLabelFn = null) {
    const short = shortLabelFn || ((label) => {
        const s = String(label || '').trim();
        if (s.length <= 12) return s;
        return `${s.slice(0, 10)}…`;
    });
    /** @type {Map<string, { cliente: string, facturaTotal: number, byDay: Map<number, number> }>} */
    const byClient = new Map();
    const daySet = new Set();

    for (const item of Array.isArray(items) ? items : []) {
        const cliente = String(item.client || '').trim();
        if (!cliente) continue;
        const factura = Number(item.totales?.facturaSum) || 0;
        const day = Number(item.closingDay) || 0;
        const cur = byClient.get(cliente) || { cliente, facturaTotal: 0, byDay: new Map() };
        cur.facturaTotal += factura;
        if (day >= 1 && day <= maxDay) {
            cur.byDay.set(day, (cur.byDay.get(day) || 0) + factura);
            daySet.add(day);
        }
        byClient.set(cliente, cur);
    }

    const days = [...daySet].sort((a, b) => a - b);
    const topClients = [...byClient.values()]
        .sort((a, b) => b.facturaTotal - a.facturaTotal || a.cliente.localeCompare(b.cliente, 'es'))
        .slice(0, maxClientes);

    let maxValue = 0;
    const rows = topClients.map((c) => {
        const cells = days.map((day) => {
            const value = c.byDay.get(day) || 0;
            if (value > maxValue) maxValue = value;
            return { day, value };
        });
        return { cliente: c.cliente, clienteShort: short(c.cliente), cells, rowTotal: c.facturaTotal };
    });

    return { days, rows, maxValue };
}

const LIDER_CHART_COLORS = [
    '#2F7BB8',
    '#65BCF7',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#64748b',
    '#ef4444'
];

/**
 * Barras apiladas: factura neta por cliente, segmentos por líder.
 * @param {object[]} flatRows - { cliente, lider, facturaCop }
 */
export function buildLiderClienteStackedChartData(flatRows, { limitClientes = 10, limitLideres = 8 } = {}, shortLabelFn = null) {
    const short =
        shortLabelFn ||
        ((label) => {
            const s = String(label || '').trim();
            if (s.length <= 14) return s;
            return `${s.slice(0, 12)}…`;
        });

    /** @type {Map<string, Map<string, number>>} */
    const byClientLider = new Map();
    for (const r of Array.isArray(flatRows) ? flatRows : []) {
        const cliente = String(r.cliente || '').trim();
        const lider = String(r.lider || '').trim() || 'Sin líder';
        const factura = Number(r.facturaCop) || 0;
        if (!cliente) continue;
        if (!byClientLider.has(cliente)) byClientLider.set(cliente, new Map());
        const lm = byClientLider.get(cliente);
        lm.set(lider, (lm.get(lider) || 0) + factura);
    }

    const clientTotals = [...byClientLider.entries()]
        .map(([cliente, lm]) => ({
            cliente,
            total: [...lm.values()].reduce((a, b) => a + b, 0)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limitClientes);

    const liderTotals = new Map();
    for (const { cliente } of clientTotals) {
        for (const [lider, v] of byClientLider.get(cliente)) {
            liderTotals.set(lider, (liderTotals.get(lider) || 0) + v);
        }
    }
    const topLideres = [...liderTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limitLideres)
        .map(([l]) => l);

    const seriesKeys = topLideres.length ? [...topLideres, 'Otros'] : ['Sin líder'];

    return clientTotals.map(({ cliente }) => {
        const lm = byClientLider.get(cliente) || new Map();
        const row = {
            cliente,
            clienteShort: short(cliente),
            total: [...lm.values()].reduce((a, b) => a + b, 0)
        };
        let otros = 0;
        for (const [lider, v] of lm) {
            if (topLideres.includes(lider)) {
                row[lider] = v;
            } else {
                otros += v;
            }
        }
        if (seriesKeys.includes('Otros') && otros > 0) row.Otros = otros;
        for (const k of seriesKeys) {
            if (row[k] == null) row[k] = 0;
        }
        return row;
    });
}

export function liderClienteChartSeriesKeys(chartData) {
    if (!Array.isArray(chartData) || !chartData.length) return [];
    const keys = new Set();
    for (const row of chartData) {
        for (const k of Object.keys(row)) {
            if (k !== 'cliente' && k !== 'clienteShort' && k !== 'total') keys.add(k);
        }
    }
    return [...keys];
}

export function liderClienteChartColor(index) {
    return LIDER_CHART_COLORS[index % LIDER_CHART_COLORS.length];
}
