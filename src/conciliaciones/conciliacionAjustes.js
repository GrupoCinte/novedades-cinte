/**
 * Overrides de tarifa y montos por cierre (cedula + anio + mes).
 * No modifica colaboradores ni novedades maestras.
 */

const { normalizeEstado } = require('./facturacionRevision');
const {
    computeNovedadImpactoMonto
} = require('./conciliacionNovedadImpacto');

const AJUSTES_EDIT_ROLES = new Set(['analista_conciliaciones', 'super_admin']);
const AJUSTES_EDIT_ESTADOS = new Set(['PENDIENTE', 'DEVUELTA']);

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
}

function parseMontosOverride(raw) {
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

function parseAjustesFromFacturacionRow(fRow) {
    const tarifaRaw = fRow?.tarifa_override;
    const tarifaOverride =
        tarifaRaw != null && tarifaRaw !== '' && Number.isFinite(Number(tarifaRaw))
            ? Math.round(Number(tarifaRaw))
            : null;
    return {
        tarifaOverride,
        montosNovedadOverride: parseMontosOverride(fRow?.montos_novedad_override)
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
    const overrides = ajustes?.montosNovedadOverride || {};
    const hasOverride = Boolean(novedadId) && overrides[novedadId] != null && overrides[novedadId] !== '';
    const overrideVal = hasOverride ? Math.round(Number(overrides[novedadId])) : null;
    const montoCop =
        overrideVal != null && Number.isFinite(overrideVal) ? overrideVal : base.montoCop;

    return {
        impacto: base.impacto,
        medida: base.medida,
        cantidad: base.cantidad,
        montoCop,
        montoCalculado: base.montoCalculado,
        montoMaestro: base.montoCop,
        montoAjustado: hasOverride,
        montoOrigen: base.montoCalculado ? 'calculado' : 'novedad',
        valorHora: base.valorHora ?? null,
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
    const r = normalizeRole(role);
    const est = normalizeEstado(estado);
    if (!AJUSTES_EDIT_ROLES.has(r)) return false;
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
    const tipo = extra.tipoNovedad ? ` (${extra.tipoNovedad})` : '';
    if (valorNuevo == null) {
        return `Restablecido monto novedad${tipo}: ${formatCopLabel(valorAnterior)} → valor base`;
    }
    return `Ajuste monto novedad${tipo}: ${formatCopLabel(valorAnterior)} → ${formatCopLabel(valorNuevo)}`;
}

module.exports = {
    AJUSTES_EDIT_ROLES,
    AJUSTES_EDIT_ESTADOS,
    parseMontosOverride,
    parseAjustesFromFacturacionRow,
    resolveEffectiveTarifa,
    resolveNovedadMontoConAjuste,
    aggregateNovedadesImpactoConAjustes,
    canEditConciliacionAjustes,
    formatCopLabel,
    buildAjusteHistorialObservacion
};
