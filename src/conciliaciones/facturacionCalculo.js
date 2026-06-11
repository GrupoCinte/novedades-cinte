'use strict';

const {
    countCalendarDaysInclusive,
    countBusinessDaysInclusive
} = require('../novedadCantidadFormat');

/**
 * @param {{ reglaTipo: string, tarifa: number, sumMonto: number, periodo: { start: string, end: string }, horasFacturadas?: number, horasBase?: number|null, fechaIngreso?: string|null }} params
 */
function computeFacturaCop(params) {
    const reglaTipo = String(params?.reglaTipo || 'MES_CALENDARIO').trim();
    const tarifa = Number(params?.tarifa) || 0;
    const sumMonto = Number(params?.sumMonto) || 0;
    const periodo = params?.periodo || {};
    const start = String(periodo.start || '');
    const end = String(periodo.end || '');
    const horasFacturadas = Number(params?.horasFacturadas) || 0;
    const horasBase = Number(params?.horasBase) || 0;
    const fechaIngreso = params?.fechaIngreso ? String(params.fechaIngreso).slice(0, 10) : null;

    const effectiveStart =
        fechaIngreso && fechaIngreso > start && fechaIngreso <= end ? fechaIngreso : start;

    if (reglaTipo === 'HORAS_BASE') {
        const base = horasBase > 0 ? horasBase : 1;
        const ratio = Math.min(Math.max(horasFacturadas / base, 0), 1);
        const bruto = tarifa * ratio;
        const factura = bruto - sumMonto;
        return {
            facturaCop: Math.max(0, Math.round(factura)),
            desglose: {
                reglaTipo,
                tarifa,
                bruto: Math.round(bruto),
                sumMonto,
                horasFacturadas,
                horasBase: base,
                ratio
            }
        };
    }

    if (reglaTipo === 'CALENDARIO_30') {
        const diasCiclo = countCalendarDaysInclusive(effectiveStart, end);
        const dailyRate = tarifa / 30;
        const bruto = dailyRate * diasCiclo;
        const factura = bruto - sumMonto;
        return {
            facturaCop: Math.max(0, Math.round(factura)),
            desglose: {
                reglaTipo,
                tarifa,
                bruto: Math.round(bruto),
                sumMonto,
                diasCiclo,
                dailyRate,
                effectiveStart
            }
        };
    }

    if (reglaTipo === 'DIAS_HABILES') {
        const diasHabilesCiclo = countBusinessDaysInclusive(effectiveStart, end);
        const diasHabilesTotales = countBusinessDaysInclusive(start, end) || 1;
        const bruto = (tarifa / diasHabilesTotales) * diasHabilesCiclo;
        const factura = bruto - sumMonto;
        return {
            facturaCop: Math.max(0, Math.round(factura)),
            desglose: {
                reglaTipo,
                tarifa,
                bruto: Math.round(bruto),
                sumMonto,
                diasHabilesCiclo,
                diasHabilesTotales,
                effectiveStart
            }
        };
    }

    // MES_CALENDARIO (legacy)
    const factura = tarifa - sumMonto;
    return {
        facturaCop: Math.max(0, Math.round(factura)),
        desglose: {
            reglaTipo,
            tarifa,
            bruto: tarifa,
            sumMonto
        }
    };
}

const ESTADOS_CONCILIADO = new Set(['CONCILIADA', 'RADICADA']);

function isConsultorConciliado(estado) {
    return ESTADOS_CONCILIADO.has(String(estado || 'PENDIENTE').trim());
}

/**
 * @param {Array<{ estado?: string }>} rows
 */
function aggregateCardState(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
        return { estadoTarjeta: 'EMPTY', estadoTarjetaLabel: 'Sin consultores' };
    }
    const estados = list.map((r) => String(r.estado || 'PENDIENTE').trim());
    if (estados.every((e) => e === 'RADICADA')) {
        return { estadoTarjeta: 'RADICADA', estadoTarjetaLabel: 'Radicada' };
    }
    if (estados.every((e) => e === 'CONCILIADA' || e === 'RADICADA')) {
        return { estadoTarjeta: 'CONCILIADA', estadoTarjetaLabel: 'Conciliada' };
    }
    if (estados.some((e) => e === 'DEVUELTA')) {
        return { estadoTarjeta: 'DEVUELTA', estadoTarjetaLabel: 'Devuelta — requiere acción' };
    }
    if (estados.every((e) => e === 'ENVIADA')) {
        return { estadoTarjeta: 'ENVIADA', estadoTarjetaLabel: 'Esperando GO del Cliente' };
    }
    return { estadoTarjeta: 'PENDIENTE', estadoTarjetaLabel: 'Pendiente de conciliar' };
}

function countConciliados(rows) {
    return (Array.isArray(rows) ? rows : []).filter((r) => isConsultorConciliado(r.estado)).length;
}

const ESTADOS_FACTURACION = ['PENDIENTE', 'ENVIADA', 'DEVUELTA', 'CONCILIADA', 'RADICADA'];

/**
 * @param {Array<{ estado?: string }>} rows
 * @returns {{ PENDIENTE: number, ENVIADA: number, DEVUELTA: number, CONCILIADA: number, RADICADA: number }}
 */
function countEstadosFromRows(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
        (acc, r) => {
            const est = String(r.estado || 'PENDIENTE').trim();
            if (ESTADOS_FACTURACION.includes(est)) acc[est] = (acc[est] || 0) + 1;
            return acc;
        },
        { PENDIENTE: 0, ENVIADA: 0, DEVUELTA: 0, CONCILIADA: 0, RADICADA: 0 }
    );
}

const DEFAULT_SLA_DIAS_VERDE = 10;
const DEFAULT_SLA_DIAS_AMARILLO = 5;

/**
 * @param {{ daysUntil: number|null|undefined, slaDiasVerde?: number, slaDiasAmarillo?: number }} params
 * @returns {'verde'|'amarillo'|'rojo'}
 */
function computeSlaTier({ daysUntil, slaDiasVerde = DEFAULT_SLA_DIAS_VERDE, slaDiasAmarillo = DEFAULT_SLA_DIAS_AMARILLO }) {
    const d = Number(daysUntil);
    const verde = Number(slaDiasVerde ?? DEFAULT_SLA_DIAS_VERDE);
    const amarillo = Number(slaDiasAmarillo ?? DEFAULT_SLA_DIAS_AMARILLO);
    if (!Number.isFinite(d)) return 'rojo';
    if (d >= verde) return 'verde';
    if (d >= amarillo) return 'amarillo';
    return 'rojo';
}

function computeSlaAlert({ daysUntil, rows, slaDiasVerde, slaDiasAmarillo }) {
    const tier = computeSlaTier({ daysUntil, slaDiasVerde, slaDiasAmarillo });
    if (tier !== 'rojo') return false;
    const list = Array.isArray(rows) ? rows : [];
    return list.some((r) => !isConsultorConciliado(r.estado));
}

module.exports = {
    computeFacturaCop,
    isConsultorConciliado,
    aggregateCardState,
    countConciliados,
    countEstadosFromRows,
    computeSlaTier,
    computeSlaAlert,
    DEFAULT_SLA_DIAS_VERDE,
    DEFAULT_SLA_DIAS_AMARILLO,
    ESTADOS_CONCILIADO
};
