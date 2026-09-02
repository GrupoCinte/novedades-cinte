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
 * Tipo de personal según el cliente cabecera (simétrico):
 * CINTE → staff; cualquier otro cliente → consultor.
 * SENA se queda SENA.
 */
function inferTipoPersonal(payload = {}) {
    if (isExplicitTipo(payload.tipo_personal) === 'sena' || isSenaSignal(payload)) return 'sena';
    if (isClienteCinte(payload.cliente)) return 'staff';
    return 'consultor';
}

/** Predicado SQL alineado a `isClienteCinte` (cabecera, no “algo Cinte” de un tercero). */
const CLIENTE_CINTE_SQL = `(
    lower(btrim(cliente)) IN ('cinte', 'grupo cinte', 'grupocinte')
    OR lower(btrim(cliente)) ~* '^cinte([[:space:]]+(sas|s\\\\.?a\\\\.?s\\\\.?|sa|ltda|s\\\\.a\\\\.))?$'
)`;

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
    digitsOnly,
    CLIENTE_CINTE_SQL
};
