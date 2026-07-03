/** Estados de conciliación / facturación (alineado con backend Zod). */
const ESTADOS_FACTURACION = ['PENDIENTE', 'APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'DEVUELTA', 'CONCILIADA'];

const COLA_ESTADO_ORDER = {
    PENDIENTE: 0,
    DEVUELTA: 1,
    EN_REVISION: 2,
    CONCILIADA: 3,
    SIN_CONSULTORES: 4
};

const COLA_ESTADO_LABELS = {
    PENDIENTE: 'Pendiente',
    EN_REVISION: 'En revisión',
    CONCILIADA: 'Conciliado',
    DEVUELTA: 'Con devoluciones',
    SIN_CONSULTORES: 'Sin consultores'
};

const COLA_SALUD_CHART_COLORS = {
    PENDIENTE: '#f59e0b',
    EN_REVISION: '#2F7BB8',
    CONCILIADA: '#10b981',
    DEVUELTA: '#ef4444',
    SIN_CONSULTORES: '#64748b'
};

const ALERTA_TIPO_LABELS = {
    devuelta: 'Con devoluciones',
    cierre_vencido: 'Cierre vencido',
    sin_consultores: 'Sin consultores',
    bajo_avance: 'Bajo avance'
};

const ALERTA_TIPO_ORDER = ['devuelta', 'cierre_vencido', 'sin_consultores', 'bajo_avance'];

const GAP_CIERRE_ALERT_TIPOS = ['cierre_vencido', 'bajo_avance'];

function normalizeCedula(value) {
    return String(value || '').replace(/\D/g, '');
}

function countEstadosFromRows(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
        (acc, r) => {
            const est = r.estado || 'PENDIENTE';
            if (ESTADOS_FACTURACION.includes(est)) acc[est] = (acc[est] || 0) + 1;
            return acc;
        },
        { PENDIENTE: 0, APROBADO_ANALISTA: 0, APROBADO_FINANZAS: 0, DEVUELTA: 0, CONCILIADA: 0 }
    );
}

function isColaboradorInactivoRow(row) {
    if (!row) return false;
    return row.activo === false || row.activoColaborador === false;
}

/**
 * Inactivos con salida en mes M (ya filtrados en resumen) fuera de la asociación Dynamo.
 */
function extractSalidasMesRows(allRows, cedulasServicio) {
    const inService = new Set((cedulasServicio || []).map(normalizeCedula).filter(Boolean));
    return (Array.isArray(allRows) ? allRows : []).filter(
        (r) => isColaboradorInactivoRow(r) && !inService.has(normalizeCedula(r.cedula))
    );
}

/** Asociados al servicio + salidas del mes (sin duplicar). */
function mergeConciliacionServicioRows(rows, cedulasServicio) {
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

/**
 * Agrega métricas de cierre: asociados Dynamo + salidas del mes M del cliente.
 */
function aggregateServicioCierre(rows, cedulas) {
    const filtered = mergeConciliacionServicioRows(rows, cedulas);
    return aggregateConciliacionRows(filtered);
}

/**
 * Estado derivado de la cola para filtros y ordenamiento.
 */
function deriveEstadoCola(agg) {
    const { consultoresTotal, consultoresCerrados, estados } = agg || {};
    if (!consultoresTotal) return 'SIN_CONSULTORES';
    if ((estados?.DEVUELTA || 0) > 0) return 'DEVUELTA';
    const finanzasOk =
        (estados?.APROBADO_FINANZAS || 0) + (estados?.CONCILIADA || 0) === consultoresTotal;
    if (finanzasOk) return 'CONCILIADA';
    if ((estados?.PENDIENTE || 0) > 0 || consultoresCerrados < consultoresTotal) return 'PENDIENTE';
    return 'EN_REVISION';
}

function colaCierreProgress(agg) {
    const total = Number(agg?.consultoresTotal) || 0;
    if (!total) return 0;
    return Math.round(((Number(agg?.consultoresCerrados) || 0) / total) * 100);
}

/** Orden: más urgentes primero (menos cerrados, estados más críticos). */
function sortColaCierresItems(items) {
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

function filterColaCierresByEstado(items, estadoColaFilter) {
    const f = String(estadoColaFilter || '').trim();
    if (!f || f === 'TODOS') return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter((i) => i.estadoCola === f);
}

/** Desplaza year/month calendario (month 1-12). */
function shiftCalendarMonth(year, month, delta) {
    const y = Number(year);
    const m = Number(month);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Mes calendario de novedades según tipo de facturación del servicio.
 * EXPIRED_MONTH (mes vencido): facturación junio → novedades mayo.
 */
function resolveNovedadesBucket(facturacionYear, facturacionMonth, billingType) {
    const type = String(billingType || '').trim().toUpperCase();
    if (type === 'EXPIRED_MONTH') {
        return shiftCalendarMonth(facturacionYear, facturacionMonth, -1);
    }
    return { year: Number(facturacionYear), month: Number(facturacionMonth) };
}

/**
 * Agrupa ítems de cola de cierres (cálculo por servicio) en filas por cliente para el dashboard.
 * Totales por cliente = suma de servicios; respeta billingType y consultores asociados de cada servicio.
 */
function aggregateDashboardFromColaItems(items) {
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

function referenceDayInSelectedMonth(year, month, now = new Date()) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 0;
    const nowY = now.getFullYear();
    const nowM = now.getMonth() + 1;
    if (y === nowY && m === nowM) return now.getDate();
    if (y < nowY || (y === nowY && m < nowM)) return new Date(y, m, 0).getDate();
    return 0;
}

function buildColaSaludChartData(items) {
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

function buildClienteStackedChartData(rows, limit = 12, shortLabelFn = null) {
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

function classifyItemAlert(item, refDay) {
    const progress = colaCierreProgress(item);
    if (item.estadoCola === 'SIN_CONSULTORES') return 'sin_consultores';
    if (item.estadoCola === 'DEVUELTA') return 'devuelta';
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

function buildDashboardAlertas(items, { year, month, now = new Date() } = {}) {
    const refDay = referenceDayInSelectedMonth(year, month, now);
    const counts = { devuelta: 0, cierre_vencido: 0, sin_consultores: 0, bajo_avance: 0 };
    const allEntries = [];

    for (const item of Array.isArray(items) ? items : []) {
        const tipo = classifyItemAlert(item, refDay);
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

    const severity = { devuelta: 0, cierre_vencido: 1, sin_consultores: 2, bajo_avance: 3 };
    allEntries.sort((a, b) => severity[a.tipo] - severity[b.tipo] || a.progress - b.progress);

    const chartData = ALERTA_TIPO_ORDER.filter((tipo) => counts[tipo] > 0).map((tipo) => ({
        tipo,
        label: ALERTA_TIPO_LABELS[tipo],
        count: counts[tipo]
    }));

    return { counts, entries: allEntries.slice(0, 8), chartData };
}

function buildGapCierreChartData(items, { year, month, now = new Date() } = {}) {
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

function buildParetoIngresosChartData(rows, limit = 12, shortLabelFn = null) {
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

function buildClienteCierreHeatmapData(items, { maxClientes = 10, maxDay = 31 } = {}, shortLabelFn = null) {
    const short = shortLabelFn || ((label) => {
        const s = String(label || '').trim();
        if (s.length <= 12) return s;
        return `${s.slice(0, 10)}…`;
    });
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

module.exports = {
    ESTADOS_FACTURACION,
    COLA_ESTADO_ORDER,
    COLA_ESTADO_LABELS,
    normalizeCedula,
    countEstadosFromRows,
    isColaboradorInactivoRow,
    extractSalidasMesRows,
    mergeConciliacionServicioRows,
    aggregateServicioCierre,
    deriveEstadoCola,
    colaCierreProgress,
    sortColaCierresItems,
    filterColaCierresByEstado,
    shiftCalendarMonth,
    resolveNovedadesBucket,
    aggregateDashboardFromColaItems,
    referenceDayInSelectedMonth,
    buildColaSaludChartData,
    buildClienteStackedChartData,
    buildDashboardAlertas,
    buildGapCierreChartData,
    buildParetoIngresosChartData,
    buildClienteCierreHeatmapData,
    COLA_SALUD_CHART_COLORS,
    ALERTA_TIPO_LABELS,
    ALERTA_TIPO_ORDER,
    GAP_CIERRE_ALERT_TIPOS
};
