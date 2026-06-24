/**
 * Cálculo de impacto en conciliación: suma (monto_cop) vs resta (tarifa/30 × días, tarifa/176 × horas).
 */

const {
    getCantidadMedidaKind,
    getDiasEfectivosNovedad,
    countCalendarDaysInclusive,
    resolveCanonicalNovedadTipo
} = require('../novedadCantidadFormat');

const DIAS_MES_FACTURACION = 30;
const HORAS_MES_LABORALES = 176;

const NOVEDAD_TIPOS_SUMA = new Set(['Bonos', 'Hora Extra', 'Disponibilidad']);

function isoDate(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function isoTime(value) {
    if (!value) return '';
    const s = String(value).trim();
    const m = /^(\d{1,2}:\d{2})/.exec(s);
    return m ? m[1] : s.slice(0, 5);
}

/** Normaliza fila PG o camelCase del API a contexto de medida. */
function novedadRowToContext(row) {
    return {
        tipoNovedad: row.tipo_novedad ?? row.tipoNovedad,
        unidad: row.unidad,
        modalidad: row.modalidad,
        cantidadHoras: row.cantidad_horas ?? row.cantidadHoras,
        montoCop: row.monto_cop ?? row.montoCop,
        fechaInicio: isoDate(row.fecha_inicio ?? row.fechaInicio),
        fechaFin: isoDate(row.fecha_fin ?? row.fechaFin),
        horaInicio: isoTime(row.hora_inicio ?? row.horaInicio),
        horaFin: isoTime(row.hora_fin ?? row.horaFin)
    };
}

function parseTimeToMinutes(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

function diffHoursFromRange(horaInicio, horaFin) {
    const a = parseTimeToMinutes(horaInicio);
    const b = parseTimeToMinutes(horaFin);
    if (a == null || b == null || b <= a) return 0;
    return Math.round(((b - a) / 60) * 100) / 100;
}

function getHorasEfectivasNovedad(tipoNovedad, row, ctx) {
    const n = Number(ctx.cantidadHoras);
    if (Number.isFinite(n) && n > 0) return n;
    return diffHoursFromRange(ctx.horaInicio, ctx.horaFin);
}

function isSuspension(tipoNovedad) {
    return resolveCanonicalNovedadTipo(tipoNovedad) === 'Suspensión';
}

function resolveMedidaConciliacion(tipoNovedad, ctx) {
    if (isSuspension(tipoNovedad)) return 'days';
    return getCantidadMedidaKind(tipoNovedad, ctx);
}

function getDiasConciliacion(tipoNovedad, ctx) {
    if (isSuspension(tipoNovedad)) {
        const fi = ctx.fechaInicio;
        const ff = ctx.fechaFin || fi;
        if (!fi || !ff) return 0;
        return countCalendarDaysInclusive(fi, ff);
    }
    return getDiasEfectivosNovedad(
        tipoNovedad,
        ctx.cantidadHoras,
        ctx.fechaInicio,
        ctx.fechaFin,
        ctx
    );
}

function roundCop(n) {
    return Math.round(Number(n) || 0);
}

function montoPorDias(tarifaCliente, dias) {
    const d = Number(dias) || 0;
    if (d <= 0) return 0;
    return roundCop((Number(tarifaCliente) / DIAS_MES_FACTURACION) * d);
}

function montoPorHoras(tarifaCliente, horas) {
    const h = Number(horas) || 0;
    if (h <= 0) return 0;
    return roundCop((Number(tarifaCliente) / HORAS_MES_LABORALES) * h);
}

function getNovedadImpactoFacturacion(tipoNovedad) {
    const canon = resolveCanonicalNovedadTipo(tipoNovedad);
    return NOVEDAD_TIPOS_SUMA.has(canon) ? 'suma' : 'resta';
}

/**
 * @param {number} tarifaCliente
 * @param {object} novedadRow - fila BD o detalle API
 */
function computeNovedadImpactoMonto(tarifaCliente, novedadRow) {
    const ctx = novedadRowToContext(novedadRow);
    const tipo = ctx.tipoNovedad;
    const impacto = getNovedadImpactoFacturacion(tipo);
    const tarifa = Number(tarifaCliente) || 0;

    if (impacto === 'suma') {
        const monto = roundCop(ctx.montoCop);
        return {
            impacto: 'suma',
            medida: 'money',
            cantidad: monto > 0 ? 1 : 0,
            montoCop: monto,
            montoCalculado: false
        };
    }

    const medida = resolveMedidaConciliacion(tipo, ctx);

    if (medida === 'hours') {
        const horas = getHorasEfectivasNovedad(tipo, novedadRow, ctx);
        const monto = montoPorHoras(tarifa, horas);
        return {
            impacto: 'resta',
            medida: 'hours',
            cantidad: horas,
            montoCop: monto,
            montoCalculado: true
        };
    }

    if (medida === 'days') {
        const dias = getDiasConciliacion(tipo, ctx);
        const monto = montoPorDias(tarifa, dias);
        return {
            impacto: 'resta',
            medida: 'days',
            cantidad: dias,
            montoCop: monto,
            montoCalculado: true
        };
    }

    return {
        impacto: 'resta',
        medida: 'none',
        cantidad: 0,
        montoCop: 0,
        montoCalculado: true
    };
}

/** Agrega impactos de una lista de novedades para un colaborador. */
function aggregateNovedadesImpacto(tarifaCliente, novedadRows) {
    let sumSuma = 0;
    let sumResta = 0;
    let count = 0;

    for (const row of novedadRows || []) {
        const r = computeNovedadImpactoMonto(tarifaCliente, row);
        count += 1;
        if (r.impacto === 'suma') sumSuma += r.montoCop;
        else sumResta += r.montoCop;
    }

    const tarifa = Number(tarifaCliente) || 0;
    return {
        count,
        sumSuma,
        sumResta,
        novedadesSumCop: sumResta,
        novedadesSumaCop: sumSuma,
        facturaCop: tarifa + sumSuma - sumResta
    };
}

function computeFacturaLedgerTotal(tarifaCliente, items) {
    const agg = aggregateNovedadesImpacto(tarifaCliente, items);
    return agg.facturaCop;
}

module.exports = {
    DIAS_MES_FACTURACION,
    HORAS_MES_LABORALES,
    NOVEDAD_TIPOS_SUMA,
    getNovedadImpactoFacturacion,
    computeNovedadImpactoMonto,
    aggregateNovedadesImpacto,
    computeFacturaLedgerTotal,
    novedadRowToContext
};
