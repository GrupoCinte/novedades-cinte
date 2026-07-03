'use strict';

const { countCalendarDaysInclusive } = require('../novedadCantidadFormat');

function isoDate(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function daysInCalendarMonth(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 30;
    return new Date(y, m, 0).getDate();
}

function monthBounds(year, month) {
    const y = Number(year);
    const m = Number(month);
    const dim = daysInCalendarMonth(y, m);
    const mm = String(m).padStart(2, '0');
    return {
        periodStart: `${y}-${mm}-01`,
        periodEnd: `${y}-${mm}-${String(dim).padStart(2, '0')}`,
        daysInMonth: dim
    };
}

function resolveFechaSalida(fechaTermino, fechaBajaEfectiva) {
    const t = isoDate(fechaTermino);
    const b = isoDate(fechaBajaEfectiva);
    return b || t || '';
}

/**
 * Días calendario facturables dentro del mes M considerando ingreso/salida.
 */
function computeDiasFacturablesMes({ year, month, fechaIngreso, fechaTermino, fechaBajaEfectiva }) {
    const { periodStart, periodEnd, daysInMonth } = monthBounds(year, month);
    const ingreso = isoDate(fechaIngreso);
    const salida = resolveFechaSalida(fechaTermino, fechaBajaEfectiva);

    let effectiveStart = periodStart;
    let effectiveEnd = periodEnd;

    if (ingreso && ingreso > periodStart) {
        if (ingreso > periodEnd) {
            return {
                diasFacturables: 0,
                daysInMonth,
                periodStart,
                periodEnd,
                effectiveStart: ingreso,
                effectiveEnd: ingreso,
                prorrateoAplicado: true
            };
        }
        effectiveStart = ingreso;
    }

    if (salida && salida < periodEnd) {
        if (salida < periodStart) {
            return {
                diasFacturables: 0,
                daysInMonth,
                periodStart,
                periodEnd,
                effectiveStart: periodStart,
                effectiveEnd: periodStart,
                prorrateoAplicado: true
            };
        }
        effectiveEnd = salida;
    }

    if (effectiveStart > effectiveEnd) {
        return {
            diasFacturables: 0,
            daysInMonth,
            periodStart,
            periodEnd,
            effectiveStart,
            effectiveEnd,
            prorrateoAplicado: true
        };
    }

    const diasFacturables = countCalendarDaysInclusive(effectiveStart, effectiveEnd);
    const prorrateoAplicado =
        diasFacturables < daysInMonth || effectiveStart > periodStart || effectiveEnd < periodEnd;

    return {
        diasFacturables,
        daysInMonth,
        periodStart,
        periodEnd,
        effectiveStart,
        effectiveEnd,
        prorrateoAplicado
    };
}

function roundCop(n) {
    return Math.round(Number(n) || 0);
}

function isHoursBillingMode(billingMode, baseHours) {
    const mode = String(billingMode || '').trim().toUpperCase();
    const bh = Number(baseHours);
    return mode === 'HOURS' && Number.isFinite(bh) && bh > 0;
}

/**
 * Prorratea tarifa mensual por proporción de días (o horas en modo HOURS).
 */
function prorrateTarifaPorDias(tarifaMaestro, diasFacturables, daysInMonth, { billingMode, baseHours } = {}) {
    const t = Number(tarifaMaestro) || 0;
    const dim = Number(daysInMonth) || 30;
    const dias = Number(diasFacturables) || 0;
    if (t <= 0 || dias <= 0) {
        return { tarifaProrrateada: 0, ratio: 0, horasFacturables: 0 };
    }
    const ratio = dias / dim;
    const tarifaProrrateada = roundCop(t * ratio);
    const hoursMode = isHoursBillingMode(billingMode, baseHours);
    const horasFacturables = hoursMode
        ? Math.round(Number(baseHours) * ratio * 100) / 100
        : null;
    return { tarifaProrrateada, ratio, horasFacturables };
}

/**
 * Recorta un tramo [desde, hasta] al periodo facturable del mes.
 * @returns {{ start: string, end: string, dias: number }|null}
 */
function clipTramoToPeriod(tramoDesde, tramoHasta, effectiveStart, effectiveEnd) {
    const desde = isoDate(tramoDesde);
    const hasta = isoDate(tramoHasta) || effectiveEnd;
    if (!desde) return null;
    const start = desde > effectiveStart ? desde : effectiveStart;
    const end = hasta < effectiveEnd ? hasta : effectiveEnd;
    if (start > end) return null;
    return { start, end, dias: countCalendarDaysInclusive(start, end) };
}

/**
 * Tarifa base del mes con tramos de historial (mid-month) + prorrateo ingreso/salida.
 * @param {Array<{ tarifa: number, vigente_desde: string, vigente_hasta?: string|null }>} tramos
 */
function resolveTarifaBaseMes({
    tarifaMaestro,
    year,
    month,
    fechaIngreso,
    fechaTermino,
    fechaBajaEfectiva,
    billingMode,
    baseHours,
    tramos = null
}) {
    const diasCtx = computeDiasFacturablesMes({
        year,
        month,
        fechaIngreso,
        fechaTermino,
        fechaBajaEfectiva
    });
    const { daysInMonth, effectiveStart, effectiveEnd } = diasCtx;

    const tramoList = Array.isArray(tramos) ? tramos.filter((t) => t && Number(t.tarifa) >= 0) : [];
    let tarifaBase = 0;
    const tramosAplicados = [];

    if (tramoList.length > 0) {
        for (const tramo of tramoList) {
            const clip = clipTramoToPeriod(
                tramo.vigente_desde,
                tramo.vigente_hasta || diasCtx.periodEnd,
                effectiveStart,
                effectiveEnd
            );
            if (!clip || clip.dias <= 0) continue;
            const parte = prorrateTarifaPorDias(tramo.tarifa, clip.dias, daysInMonth, {
                billingMode,
                baseHours
            });
            tarifaBase += parte.tarifaProrrateada;
            tramosAplicados.push({
                tarifa: roundCop(tramo.tarifa),
                vigenteDesde: clip.start,
                vigenteHasta: clip.end,
                dias: clip.dias,
                montoCop: parte.tarifaProrrateada
            });
        }
        tarifaBase = roundCop(tarifaBase);
    } else {
        const parte = prorrateTarifaPorDias(
            tarifaMaestro,
            diasCtx.diasFacturables,
            daysInMonth,
            { billingMode, baseHours }
        );
        tarifaBase = parte.tarifaProrrateada;
    }

    const ratio =
        daysInMonth > 0 ? Math.min(1, Math.max(0, diasCtx.diasFacturables / daysInMonth)) : 0;
    const horasFacturables = isHoursBillingMode(billingMode, baseHours)
        ? Math.round(Number(baseHours) * ratio * 100) / 100
        : null;

    return {
        tarifaMaestro: roundCop(tarifaMaestro),
        tarifaBase,
        tarifaProrrateada: tarifaBase,
        ...diasCtx,
        horasFacturables,
        tramosAplicados,
        prorrateoAplicado: diasCtx.prorrateoAplicado || tramosAplicados.length > 1
    };
}

/** SQL: incluir activos o inactivos con salida en el mes de facturación. */
function colaboradorVisibleEnMesSql(alias, yearParamIdx, monthParamIdx) {
    const p = alias ? `${alias}.` : '';
    return `(
        ${p}activo IS NOT FALSE
        OR (
            COALESCE(${p}fecha_termino, ${p}fecha_baja_efectiva) IS NOT NULL
            AND EXTRACT(YEAR FROM COALESCE(${p}fecha_termino, ${p}fecha_baja_efectiva)::date) = $${yearParamIdx}::integer
            AND EXTRACT(MONTH FROM COALESCE(${p}fecha_termino, ${p}fecha_baja_efectiva)::date) = $${monthParamIdx}::integer
        )
    )`;
}

module.exports = {
    isoDate,
    daysInCalendarMonth,
    monthBounds,
    computeDiasFacturablesMes,
    prorrateTarifaPorDias,
    resolveTarifaBaseMes,
    colaboradorVisibleEnMesSql,
    resolveFechaSalida
};
