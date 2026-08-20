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

function resolveFechaSalida(fechaTermino) {
    return isoDate(fechaTermino);
}

/**
 * Días calendario facturables dentro del mes M considerando ingreso/salida.
 */
function computeDiasFacturablesMes({ year, month, fechaIngreso, fechaTermino }) {
    const { periodStart, periodEnd, daysInMonth } = monthBounds(year, month);
    const ingreso = isoDate(fechaIngreso);
    const salida = resolveFechaSalida(fechaTermino);

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

/**
 * Días hábiles nominales del mes (5 días/semana × 4 semanas). Se usa para derivar
 * las horas por día laborable en modo HOURS: horasDia = baseHours / 20
 * (ej. baseHours 180 → 9 h/día; baseHours 160 → 8 h/día).
 */
const DIAS_HABILES_NOMINAL_MES = 20;

function isHoursBillingMode(billingMode, baseHours) {
    const mode = String(billingMode || '').trim().toUpperCase();
    const bh = Number(baseHours);
    return mode === 'HOURS' && Number.isFinite(bh) && bh > 0;
}

/** Horas laborables por día en modo HOURS (baseHours / 20 días hábiles nominales). */
function horasPorDiaLaboral(baseHours) {
    const bh = Number(baseHours) || 0;
    return bh > 0 ? bh / DIAS_HABILES_NOMINAL_MES : 0;
}

/**
 * Cuenta días hábiles (lunes a viernes) en [start, end] inclusive, excluyendo
 * los festivos presentes en `festivosSet` (claves YYYY-MM-DD). Si no se provee
 * `festivosSet`, solo se excluyen los fines de semana.
 */
function countBusinessDaysInclusive(startDateRaw, endDateRaw, festivosSet = null) {
    if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
    const start = new Date(`${startDateRaw}T00:00:00`);
    const end = new Date(`${endDateRaw}T00:00:00`);
    const hasFestivos = festivosSet && typeof festivosSet.has === 'function';
    let count = 0;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const day = cursor.getDay();
        if (day === 0 || day === 6) continue;
        if (hasFestivos) {
            const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
            if (festivosSet.has(ymd)) continue;
        }
        count += 1;
    }
    return count;
}

/**
 * Prorratea tarifa mensual por proporción de días.
 * - Modo calendario: ratio = díasCalendario / díasDelMes.
 * - Modo HOURS: horas = díasHábilesTrabajados × (baseHours/20), con tope en baseHours,
 *   y la tarifa se prorratea por horas/baseHours (el valor hora NO se prorratea).
 */
function prorrateTarifaPorDias(
    tarifaMaestro,
    diasFacturables,
    daysInMonth,
    { billingMode, baseHours, businessDays } = {}
) {
    const t = Number(tarifaMaestro) || 0;
    const dim = Number(daysInMonth) || 30;
    const dias = Number(diasFacturables) || 0;
    if (t <= 0 || dias <= 0) {
        return { tarifaProrrateada: 0, ratio: 0, horasFacturables: 0 };
    }
    if (isHoursBillingMode(billingMode, baseHours)) {
        const bh = Number(baseHours);
        const bd = Number(businessDays) || 0;
        const horasFacturables = Math.min(bh, Math.round(bd * horasPorDiaLaboral(bh) * 100) / 100);
        const ratio = bh > 0 ? horasFacturables / bh : 0;
        return { tarifaProrrateada: roundCop(t * ratio), ratio, horasFacturables };
    }
    const ratio = dias / dim;
    return { tarifaProrrateada: roundCop(t * ratio), ratio, horasFacturables: null };
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
    billingMode,
    baseHours,
    tramos = null,
    festivosSet = null
}) {
    const diasCtx = computeDiasFacturablesMes({
        year,
        month,
        fechaIngreso,
        fechaTermino
    });
    const { daysInMonth, effectiveStart, effectiveEnd } = diasCtx;

    const tramoList = Array.isArray(tramos) ? tramos.filter((t) => t && Number(t.tarifa) >= 0) : [];
    let tarifaBase = 0;
    const tramosAplicados = [];

    if (isHoursBillingMode(billingMode, baseHours)) {
        // Modo HOURS: días hábiles × horas/día solo cuando hay mes parcial (ingreso/salida).
        // Mes completo → baseHours (180 h) = tarifa catálogo, sin descontar festivos del mes.
        const bh = Number(baseHours);
        const perDay = horasPorDiaLaboral(bh);
        const businessDaysWorked =
            diasCtx.diasFacturables > 0
                ? countBusinessDaysInclusive(effectiveStart, effectiveEnd, festivosSet)
                : 0;
        const horasFacturables = diasCtx.prorrateoAplicado
            ? Math.min(bh, Math.round(businessDaysWorked * perDay * 100) / 100)
            : bh;

        if (tramoList.length > 0 && businessDaysWorked > 0) {
            for (const tramo of tramoList) {
                const clip = clipTramoToPeriod(
                    tramo.vigente_desde,
                    tramo.vigente_hasta || diasCtx.periodEnd,
                    effectiveStart,
                    effectiveEnd
                );
                if (!clip || clip.dias <= 0) continue;
                const clipBusinessDays = countBusinessDaysInclusive(clip.start, clip.end, festivosSet);
                // Reparte las horas facturables (ya topadas) según los días hábiles del tramo.
                const clipHoras = (horasFacturables * clipBusinessDays) / businessDaysWorked;
                const parteTarifa = bh > 0 ? roundCop(Number(tramo.tarifa) * (clipHoras / bh)) : 0;
                tarifaBase += parteTarifa;
                tramosAplicados.push({
                    tarifa: roundCop(tramo.tarifa),
                    vigenteDesde: clip.start,
                    vigenteHasta: clip.end,
                    dias: clip.dias,
                    horas: Math.round(clipHoras * 100) / 100,
                    montoCop: parteTarifa
                });
            }
            tarifaBase = roundCop(tarifaBase);
        } else {
            tarifaBase = bh > 0 ? roundCop((Number(tarifaMaestro) || 0) * (horasFacturables / bh)) : 0;
        }

        return {
            tarifaMaestro: roundCop(tarifaMaestro),
            tarifaBase,
            tarifaProrrateada: tarifaBase,
            ...diasCtx,
            businessDaysFacturables: businessDaysWorked,
            horasFacturables,
            tramosAplicados,
            prorrateoAplicado: diasCtx.prorrateoAplicado || tramosAplicados.length > 1
        };
    }

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

    return {
        tarifaMaestro: roundCop(tarifaMaestro),
        tarifaBase,
        tarifaProrrateada: tarifaBase,
        ...diasCtx,
        horasFacturables: null,
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
            ${p}fecha_termino IS NOT NULL
            AND EXTRACT(YEAR FROM ${p}fecha_termino::date) = $${yearParamIdx}::integer
            AND EXTRACT(MONTH FROM ${p}fecha_termino::date) = $${monthParamIdx}::integer
        )
    )`;
}

module.exports = {
    isoDate,
    daysInCalendarMonth,
    monthBounds,
    computeDiasFacturablesMes,
    countBusinessDaysInclusive,
    horasPorDiaLaboral,
    prorrateTarifaPorDias,
    resolveTarifaBaseMes,
    colaboradorVisibleEnMesSql,
    resolveFechaSalida
};
