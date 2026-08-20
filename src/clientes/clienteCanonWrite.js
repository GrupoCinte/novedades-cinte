'use strict';

const {
    foldForMatch,
    buildFoldToCanonicoMap,
    matchExcelClienteABd
} = require('../cotizador/clienteNombreMatch');
const { normalizeCatalogValue } = require('../utils');

/**
 * Aliases Zoho/n8n → nombre canónico de `clientes_lideres`.
 * No incluir «Falabella» a secas (Retail / Banco / Seguros).
 * No mapear EXPERIAN CHILE / EXPERIAN PERU hacia EXPERIAN.
 */
const CLIENTE_WRITE_ALIASES = [
    ['IBM DE COLOMBIA S.A.', 'IBM Colombia'],
    ['IBM DE COLOMBIA SA', 'IBM Colombia'],
    ['IBM DE COLOMBIA S A', 'IBM Colombia'],
    ['BANCO FALABELLA', 'FALABELLA BANCO'],
    ['FONDOS DE PENSIONES Y CESANTIAS PORVENIR', 'PORVENIR'],
    ['FONDOS DE PENSIONES Y CESANTÍAS PORVENIR', 'PORVENIR'],
    ['EXPERIAN COLOMBIA', 'EXPERIAN'],
    ['SODIMAC COLOMBIA S.A.', 'SODIMAC'],
    ['SODIMAC COLOMBIA SA', 'SODIMAC'],
    ['SEGUROS ALFA', 'ALFA'],
    ['AGENCIA DE SEGUROS FALABELLA LTDA', 'AGENCIA DE SEGUROS FALABELLA'],
    ['KYNDRYL COLOMBIA', 'KYNDRYL'],
    ['AVAL VALOR COMPARTIDO - AVC', 'AVC'],
    ['AVAL VALOR COMPARTIDO AVC', 'AVC'],
    ['DALE - AVAL', 'DALE'],
    ['PORVENIR - AVAL', 'PORVENIR'],
    ['DIRECT TV CHILE', 'DIRECTV CHILE'],
    ['DIRECT TV PERU', 'DIRECTV PERU'],
    ['DIRECT TV PERÚ', 'DIRECTV PERU'],
    ['AVC - GOU PAYMENTS', 'AVC'],
    ['BANCO OCCIDENTE', 'BANCO DE OCCIDENTE'],
    ['CONSORCIO EPS', 'CONSORCIO'],
    ['SEGUROS FALABELLA', 'AGENCIA DE SEGUROS FALABELLA']
];

const AMBIGUOUS_STANDALONE = new Set(['falabella']);

function buildAliasFoldMap() {
    const map = new Map();
    for (const [from, to] of CLIENTE_WRITE_ALIASES) {
        const k = foldForMatch(from);
        if (k) map.set(k, to);
    }
    return map;
}

const ALIAS_FOLD_MAP = buildAliasFoldMap();

function lookupWriteAlias(raw) {
    const k = foldForMatch(raw);
    if (!k || AMBIGUOUS_STANDALONE.has(k)) return null;
    return ALIAS_FOLD_MAP.get(k) || null;
}

/**
 * Resuelve el texto de Zoho/n8n/Excel al string exacto de `clientes_lideres`.
 * Si no hay match ni alias, deja el valor recortado (no inventa cliente).
 * @param {unknown} raw
 * @param {string[]} [clientesCanonico]
 * @returns {string}
 */
function resolveClienteOnWrite(raw, clientesCanonico = []) {
    const trimmed = normalizeCatalogValue(raw);
    if (!trimmed) return '';
    if (AMBIGUOUS_STANDALONE.has(foldForMatch(trimmed))) return trimmed;

    const { map } = buildFoldToCanonicoMap(Array.isArray(clientesCanonico) ? clientesCanonico : []);
    const foldHit = matchExcelClienteABd(trimmed, map);
    if (foldHit) return foldHit;

    const aliasTarget = lookupWriteAlias(trimmed);
    if (aliasTarget) {
        return matchExcelClienteABd(aliasTarget, map) || aliasTarget;
    }
    return trimmed;
}

async function loadClientesCanonico(poolOrClient) {
    if (!poolOrClient || typeof poolOrClient.query !== 'function') return [];
    const q = await poolOrClient.query(
        `SELECT DISTINCT cliente
         FROM clientes_lideres
         WHERE activo IS NOT FALSE
           AND NULLIF(BTRIM(cliente), '') IS NOT NULL`
    );
    return (q.rows || []).map((r) => String(r.cliente || '').trim()).filter(Boolean);
}

async function resolveClienteOnWriteAsync(poolOrClient, raw) {
    const canon = await loadClientesCanonico(poolOrClient);
    return resolveClienteOnWrite(raw, canon);
}

/** Clave de igualdad: alias Zoho + fold (tildes/mayúsculas). No inventa cliente. */
function clienteMatchKey(raw) {
    const trimmed = normalizeCatalogValue(raw);
    if (!trimmed) return '';
    const alias = lookupWriteAlias(trimmed);
    return foldForMatch(alias || trimmed);
}

function sameClienteLabel(a, b) {
    const ka = clienteMatchKey(a);
    const kb = clienteMatchKey(b);
    return Boolean(ka && kb && ka === kb);
}

module.exports = {
    CLIENTE_WRITE_ALIASES,
    lookupWriteAlias,
    resolveClienteOnWrite,
    loadClientesCanonico,
    resolveClienteOnWriteAsync,
    clienteMatchKey,
    sameClienteLabel
};
