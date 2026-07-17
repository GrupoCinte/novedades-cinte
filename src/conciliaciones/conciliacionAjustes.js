const AJUSTES_EDIT_ESTADOS = new Set(['PENDIENTE', 'DEVUELTA']);

const { canEditConciliacionAjustesRole, normalizeRole } = require('./conciliacionRbac');
const { normalizeEstado } = require('./facturacionRevision');
const {
    computeNovedadImpactoMonto,
    resolveCantidadHorasFacturacion,
    isHoursBillingMode,
    montoPorHoras,
    resolveHorasBaseMes
} = require('./conciliacionNovedadImpacto');

function parseJsonOverrideMap(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    return {};
}

/** @deprecated use parseJsonOverrideMap */
function parseMontosOverride(raw) {
    return parseJsonOverrideMap(raw);
}

function parseAjustesFromFacturacionRow(fRow) {
    const tarifaRaw = fRow?.tarifa_override;
    const tarifaOverride =
        tarifaRaw != null && tarifaRaw !== '' && Number.isFinite(Number(tarifaRaw))
            ? Math.round(Number(tarifaRaw))
            : null;
    return {
        tarifaOverride,
        montosNovedadOverride: parseJsonOverrideMap(fRow?.montos_novedad_override),
        cantidadHorasNovedadOverride: parseJsonOverrideMap(fRow?.cantidad_horas_novedad_override)
    };
}

function resolveEffectiveTarifa(tarifaMaestro, ajustes) {
    const maestro = Math.round(Number(tarifaMaestro) || 0);
    const override = ajustes?.tarifaOverride;
    if (override != null && Number.isFinite(override)) return Math.round(override);
    return maestro;
}

function resolveNovedadMontoConAjuste(tarifaMaestro, novedadRow, ajustes, impactOptions = {}) {
    const effectiveTarifa = resolveEffectiveTarifa(tarifaMaestro, ajustes);
    const base = computeNovedadImpactoMonto(effectiveTarifa, novedadRow, impactOptions);
    const novedadId = String(novedadRow.id ?? novedadRow.novedad_id ?? '').trim();

    const chOverrides = ajustes?.cantidadHorasNovedadOverride || {};
    const hasChOverride = Boolean(novedadId) && chOverrides[novedadId] != null && chOverrides[novedadId] !== '';
    const chOverrideVal = hasChOverride ? Number(chOverrides[novedadId]) : null;

    const montoOverrides = ajustes?.montosNovedadOverride || {};
    const hasMontoOverride = Boolean(novedadId) && montoOverrides[novedadId] != null && montoOverrides[novedadId] !== '';
    const montoOverrideVal = hasMontoOverride ? Math.round(Number(montoOverrides[novedadId])) : null;

    const valorHoraMaestro = base.valorHora ?? null;
    const valorHora = valorHoraMaestro;
    const cantidadHorasMaestro =
        base.cantidadHoras ?? resolveCantidadHorasFacturacion(base.medida, base.cantidad, impactOptions);
    const cantidadHoras =
        hasChOverride && Number.isFinite(chOverrideVal)
            ? Math.round(chOverrideVal * 100) / 100
            : cantidadHorasMaestro;

    let montoCop;
    if (hasMontoOverride && Number.isFinite(montoOverrideVal)) {
        montoCop = montoOverrideVal;
    } else if (
        hasChOverride &&
        Number.isFinite(chOverrideVal) &&
        chOverrideVal >= 0 &&
        base.montoCalculado &&
        isHoursBillingMode(impactOptions) &&
        (base.medida === 'hours' || base.medida === 'days')
    ) {
        montoCop = montoPorHoras(effectiveTarifa, cantidadHoras, resolveHorasBaseMes(impactOptions));
    } else {
        montoCop = base.montoCop;
    }

    const montoAjustado = hasMontoOverride || (hasChOverride && montoCop !== base.montoCop);

    return {
        impacto: base.impacto,
        medida: base.medida,
        cantidad: base.cantidad,
        cantidadHoras,
        cantidadHorasMaestro,
        cantidadHorasAjustado: hasChOverride,
        montoCop,
        montoCalculado: base.montoCalculado,
        montoMaestro: base.montoCop,
        montoAjustado,
        montoOrigen: base.montoCalculado ? 'calculado' : 'novedad',
        valorHora,
        valorHoraMaestro,
        valorHoraAjustado: false,
        horasBaseMes: base.horasBaseMes ?? null
    };
}

function aggregateNovedadesImpactoConAjustes(tarifaMaestro, novedadRows, ajustes, impactOptions = {}) {
    const effectiveTarifa = resolveEffectiveTarifa(tarifaMaestro, ajustes);
    let sumSuma = 0;
    let sumResta = 0;
    let count = 0;

    for (const row of novedadRows || []) {
        const r = resolveNovedadMontoConAjuste(tarifaMaestro, row, ajustes, impactOptions);
        count += 1;
        if (r.impacto === 'suma') sumSuma += r.montoCop;
        else sumResta += r.montoCop;
    }

    return {
        count,
        sumSuma,
        sumResta,
        novedadesSumCop: sumResta,
        novedadesSumaCop: sumSuma,
        facturaCop: effectiveTarifa + sumSuma - sumResta,
        tarifaCliente: effectiveTarifa,
        tarifaMaestro: Math.round(Number(tarifaMaestro) || 0),
        tarifaAjustada: ajustes?.tarifaOverride != null
    };
}

function canEditConciliacionAjustes(role, estado) {
    const est = normalizeEstado(estado);
    if (!canEditConciliacionAjustesRole(role)) return false;
    return AJUSTES_EDIT_ESTADOS.has(est);
}

function formatCopLabel(n) {
    const x = Math.round(Number(n) || 0);
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(x);
}

function buildAjusteHistorialObservacion(campo, valorAnterior, valorNuevo, extra = {}) {
    if (campo === 'tarifa') {
        return `Ajuste tarifa: ${formatCopLabel(valorAnterior)} → ${formatCopLabel(valorNuevo)}`;
    }
    if (campo === 'cantidad_horas_novedad') {
        const tipo = extra.tipoNovedad ? ` (${extra.tipoNovedad})` : '';
        if (valorNuevo == null) {
            return `Restablecidas horas novedad${tipo}: ${valorAnterior} h → valor base`;
        }
        return `Ajuste horas novedad${tipo}: ${valorAnterior} h → ${valorNuevo} h`;
    }
    const tipo = extra.tipoNovedad ? ` (${extra.tipoNovedad})` : '';
    if (valorNuevo == null) {
        return `Restablecido monto novedad${tipo}: ${formatCopLabel(valorAnterior)} → valor base`;
    }
    return `Ajuste monto novedad${tipo}: ${formatCopLabel(valorAnterior)} → ${formatCopLabel(valorNuevo)}`;
}

module.exports = {
    AJUSTES_EDIT_ESTADOS,
    parseMontosOverride,
    parseJsonOverrideMap,
    parseAjustesFromFacturacionRow,
    resolveEffectiveTarifa,
    resolveNovedadMontoConAjuste,
    aggregateNovedadesImpactoConAjustes,
    canEditConciliacionAjustes,
    formatCopLabel,
    buildAjusteHistorialObservacion
};
