'use strict';

const { foldForMatch } = require('../cotizador/clienteNombreMatch');

const TIPOS = new Set(['consultor', 'staff', 'sena', 'alianza']);

function digitsOnly(value) {
    if (value == null) return '';
    return String(value).replace(/\D+/g, '');
}

function foldBlob(...parts) {
    return parts
        .map((p) => foldForMatch(p))
        .filter(Boolean)
        .join(' ');
}

function isExplicitTipo(value) {
    const k = String(value || '')
        .trim()
        .toLowerCase();
    return TIPOS.has(k) ? k : null;
}

/** Cliente interno CINTE (Staff), no “algo Cinte” de un tercero. */
function isClienteCinte(cliente) {
    const fold = foldForMatch(cliente);
    if (!fold) return false;
    if (fold === 'cinte' || fold === 'grupo cinte' || fold === 'grupocinte') return true;
    return /^cinte(\s+(sas|s\.?a\.?s\.?|sa|ltda|s\.a\.))?$/.test(fold);
}

function isSenaSignal(payload = {}) {
    const blob = foldBlob(
        payload.tipo_personal,
        payload.tipo_contrato,
        payload.cliente,
        payload.puesto,
        payload.subtipo_sena,
        payload.area_asignada_sena
    );
    if (!blob) return false;
    if (/\bsena\b/.test(blob)) return true;
    return Boolean(payload.subtipo_sena || payload.area_asignada_sena);
}

/**
 * Tipo de personal al crear/promover.
 * Explícito gana. Si no hay tipo: SENA por señales, Staff si el cliente es CINTE, si no consultor.
 */
function inferTipoPersonal(payload = {}) {
    const explicit = isExplicitTipo(payload.tipo_personal);
    if (explicit) return explicit;
    if (isSenaSignal(payload)) return 'sena';
    if (isClienteCinte(payload.cliente)) return 'staff';
    const rawTipo = foldForMatch(payload.tipo_personal);
    if (rawTipo.includes('staff')) return 'staff';
    return 'consultor';
}

function extractCedulaFromRecord(data) {
    if (!data || typeof data !== 'object') return '';
    const nested = data.fullData && typeof data.fullData === 'object' ? data.fullData : null;
    const raw =
        data.cedula ??
        data.identificacion ??
        data.Identificacion_Numero ??
        (nested && (nested.cedula ?? nested.identificacion ?? nested.Identificacion_Numero));
    return digitsOnly(raw);
}

module.exports = {
    inferTipoPersonal,
    isClienteCinte,
    isSenaSignal,
    extractCedulaFromRecord,
    digitsOnly
};
