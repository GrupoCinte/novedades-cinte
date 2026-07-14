/**
 * Cálculo de impacto en conciliación: suma (monto_cop) vs resta (tarifa/30 × días, tarifa/176 × horas).
 */

const {
    countBusinessDaysInclusive,
    horasPorDiaLaboral
} = require('./conciliacionTarifaProrrateo');

const {
    getCantidadMedidaKind,
    getDiasEfectivosNovedad,
    countCalendarDaysInclusive,
    resolveCanonicalNovedadTipo,
    getNovedadRule
} = require('../novedadCantidadFormat');
const DIAS_MES_FACTURACION = 30;
const HORAS_MES_LABORALES = 176;
/** @deprecated Usar horasPorDiaLaboral(baseHours) — mantiene compatibilidad con baseHours 180. */
const HORAS_LABOR_DIA = 9;

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
    const kind = getCantidadMedidaKind(tipoNovedad, ctx);
    if (kind !== 'neutral') return kind;
    const fi = ctx.fechaInicio;
    const ff = ctx.fechaFin || fi;
    if (!fi || !ff) return kind;
    const ch = Number(ctx.cantidadHoras);
    if (ch > 0) return 'days';
    if (fi !== ff) return 'days';
    return kind;
}

function buildImpactoHorasMode(tarifa, horas, horasBaseMes, impacto) {
    const valorHora = computeValorHoraCop(tarifa, horasBaseMes);
    return {
        impacto,
        medida: 'hours',
        cantidad: horas,
        cantidadHoras: horas,
        montoCop: montoPorHoras(tarifa, horas, horasBaseMes),
        montoCalculado: true,
        valorHora,
        horasBaseMes
    };
}

function buildImpactoDiasHorasMode(tarifa, dias, horasBaseMes) {
    const valorHora = computeValorHoraCop(tarifa, horasBaseMes);
    const horasPorDia = horasPorDiaLaboral(horasBaseMes);
    const horas = Math.round((Number(dias) || 0) * horasPorDia * 100) / 100;
    return {
        impacto: 'resta',
        medida: 'days',
        cantidad: dias,
        cantidadHoras: horas,
        montoCop: montoPorHoras(tarifa, horas, horasBaseMes),
        montoCalculado: true,
        valorHora,
        horasBaseMes
    };
}

function isIncapacidadTipo(tipoNovedad) {
    return resolveCanonicalNovedadTipo(tipoNovedad) === 'Incapacidad';
}

function getDiasConciliacion(tipoNovedad, ctx, options = {}) {
    const festivosSet = options.festivosSet ?? null;
    if (isSuspension(tipoNovedad)) {
        const fi = ctx.fechaInicio;
        const ff = ctx.fechaFin || fi;
        if (!fi || !ff) return 0;
        return countCalendarDaysInclusive(fi, ff);
    }
    const fi = ctx.fechaInicio;
    const ff = ctx.fechaFin || fi;
    if (isIncapacidadTipo(tipoNovedad) && fi && ff) {
        return countBusinessDaysInclusive(fi, ff, festivosSet);
    }
    const n = Number(ctx.cantidadHoras);
    if (n > 0) return n;
    if (fi && ff) {
        const rule = getNovedadRule(tipoNovedad);
        if (rule.autoCalendarDays) return countCalendarDaysInclusive(fi, ff);
        return countBusinessDaysInclusive(fi, ff, festivosSet);
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

function montoPorDias(tarifaCliente, dias, options = {}) {
    const d = Number(dias) || 0;
    if (d <= 0) return 0;
    const denom = resolveDiasDenominadorMes(options);
    return roundCop((Number(tarifaCliente) / denom) * d);
}

function resolveDiasDenominadorMes(options = {}) {
    const custom = Number(options.diasDenominadorMes);
    if (Number.isFinite(custom) && custom > 0) return custom;
    const y = Number(options.factAnio ?? options.factYear ?? options.anio);
    const m = Number(options.factMes ?? options.factMonth ?? options.mes);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        return new Date(y, m, 0).getDate();
    }
    return DIAS_MES_FACTURACION;
}

/** Horas base del mes: baseHours del servicio en modo HOURS, si no 176. */
function resolveHorasBaseMes(options = {}) {
    const mode = String(options.billingMode || '').trim().toUpperCase();
    const bh = Number(options.baseHours);
    if (mode === 'HOURS' && Number.isFinite(bh) && bh > 0) return bh;
    return HORAS_MES_LABORALES;
}

function computeValorHoraCop(tarifa, horasBaseMes) {
    const base = Number(horasBaseMes) || HORAS_MES_LABORALES;
    const t = Number(tarifa) || 0;
    if (base <= 0) return 0;
    return roundCop(t / base);
}

function montoPorHoras(tarifaCliente, horas, horasBaseMes = HORAS_MES_LABORALES) {
    const h = Number(horas) || 0;
    if (h <= 0) return 0;
    const base = Number(horasBaseMes) || HORAS_MES_LABORALES;
    return roundCop((Number(tarifaCliente) / base) * h);
}

function isHoursBillingMode(options = {}) {
    const mode = String(options.billingMode || '').trim().toUpperCase();
    const bh = Number(options.baseHours);
    return mode === 'HOURS' && Number.isFinite(bh) && bh > 0;
}

/** Horas facturables de una novedad en modo HOURS (días × h/día laboral o horas directas). */
function resolveCantidadHorasFacturacion(medida, cantidad, options = {}) {
    const q = Number(cantidad) || 0;
    if (q <= 0 || !isHoursBillingMode(options)) return null;
    if (medida === 'hours') return q;
    if (medida === 'days') {
        const horasPorDia = horasPorDiaLaboral(resolveHorasBaseMes(options));
        return Math.round(q * horasPorDia * 100) / 100;
    }
    return null;
}

/** Contexto de facturación por horas para respuestas API / UI. */
function buildHorasBillingContext(options = {}, tarifa = 0) {
    const mode = String(options.billingMode || '').trim().toUpperCase();
    const bh = Number(options.baseHours);
    const useHoursMode = mode === 'HOURS' && Number.isFinite(bh) && bh > 0;
    return {
        billingMode: mode || null,
        baseHours: useHoursMode ? bh : null,
        horasBaseMes: useHoursMode ? bh : null,
        horasPorDiaLaboral: useHoursMode ? horasPorDiaLaboral(bh) : null,
        tarifaValorHora: useHoursMode ? computeValorHoraCop(tarifa, bh) : null
    };
}

function getNovedadImpactoFacturacion(tipoNovedad) {
    const canon = resolveCanonicalNovedadTipo(tipoNovedad);
    return NOVEDAD_TIPOS_SUMA.has(canon) ? 'suma' : 'resta';
}

/**
 * @param {number} tarifaCliente
 * @param {object} novedadRow - fila BD o detalle API
 */
function computeNovedadImpactoMonto(tarifaCliente, novedadRow, options = {}) {
    const ctx = novedadRowToContext(novedadRow);
    const tipo = ctx.tipoNovedad;
    const impacto = getNovedadImpactoFacturacion(tipo);
    const tarifa = Number(tarifaCliente) || 0;

    if (impacto === 'suma') {
        const canon = resolveCanonicalNovedadTipo(tipo);
        if (isHoursBillingMode(options) && canon === 'Hora Extra') {
            const horasBaseMes = resolveHorasBaseMes(options);
            const horas = getHorasEfectivasNovedad(tipo, novedadRow, ctx);
            if (horas > 0) {
                return buildImpactoHorasMode(tarifa, horas, horasBaseMes, 'suma');
            }
        }
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
    const horasBaseMes = resolveHorasBaseMes(options);
    const hoursMode = isHoursBillingMode(options);

    if (medida === 'hours') {
        const horas = getHorasEfectivasNovedad(tipo, novedadRow, ctx);
        if (hoursMode) {
            return buildImpactoHorasMode(tarifa, horas, horasBaseMes, 'resta');
        }
        const monto = montoPorHoras(tarifa, horas, horasBaseMes);
        return {
            impacto: 'resta',
            medida: 'hours',
            cantidad: horas,
            montoCop: monto,
            montoCalculado: true
        };
    }

    if (medida === 'days') {
        const dias = getDiasConciliacion(tipo, ctx, options);
        if (hoursMode) {
            return buildImpactoDiasHorasMode(tarifa, dias, horasBaseMes);
        }
        const monto = montoPorDias(tarifa, dias, options);
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
function aggregateNovedadesImpacto(tarifaCliente, novedadRows, options = {}) {
    let sumSuma = 0;
    let sumResta = 0;
    let count = 0;

    for (const row of novedadRows || []) {
        const r = computeNovedadImpactoMonto(tarifaCliente, row, options);
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

/** Monto COP = valor hora × cantidad de horas (modo HOURS). */
function computeMontoCopFromCantidadHoras(valorHora, cantidadHoras) {
    const vh = roundCop(Number(valorHora) || 0);
    const h = Number(cantidadHoras) || 0;
    if (vh <= 0 || h <= 0) return 0;
    return roundCop(vh * h);
}

/** @deprecated use computeMontoCopFromCantidadHoras */
function computeMontoCopFromValorHoraMedida(impactBase, valorHora, impactOptions = {}) {
    const horas =
        impactBase?.cantidadHoras ??
        resolveCantidadHorasFacturacion(impactBase?.medida, impactBase?.cantidad, impactOptions);
    if (horas == null || horas <= 0) return roundCop(Number(impactBase?.montoCop) || 0);
    return computeMontoCopFromCantidadHoras(valorHora, horas);
}

module.exports = {
    DIAS_MES_FACTURACION,
    HORAS_MES_LABORALES,
    HORAS_LABOR_DIA,
    horasPorDiaLaboral,
    NOVEDAD_TIPOS_SUMA,
    getNovedadImpactoFacturacion,
    resolveHorasBaseMes,
    computeValorHoraCop,
    buildHorasBillingContext,
    montoPorHoras,
    montoPorDias,
    resolveDiasDenominadorMes,
    resolveCantidadHorasFacturacion,
    isHoursBillingMode,
    computeNovedadImpactoMonto,
    resolveMedidaConciliacion,
    aggregateNovedadesImpacto,
    computeFacturaLedgerTotal,
    computeMontoCopFromCantidadHoras,
    computeMontoCopFromValorHoraMedida,
    novedadRowToContext
};
