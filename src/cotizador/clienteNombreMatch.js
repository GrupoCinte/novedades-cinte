const { normalizeCatalogValue } = require('../utils');

/**
 * Clave estable para comparar nombres de cliente (Excel vs `clientes_lideres` vs claves en `cargos_por_cliente`).
 * - Misma base que `normalizeCatalogValue` (espacios colapsados).
 * - Minúsculas y sin marcas diacríticas (NFD) para que coincidan variaciones típicas del Excel.
 */
function foldForMatch(value) {
    const t = normalizeCatalogValue(value).toLowerCase();
    if (!t) return '';
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * @param {string[]} clientesCanonico Lista DISTINCT cliente desde `clientes_lideres` (orden no importa).
 * @returns {{ map: Map<string, string>, warnings: string[] }}
 */
function buildFoldToCanonicoMap(clientesCanonico) {
    /** @type {Map<string, string>} */
    const map = new Map();
    const warnings = [];
    for (const c of clientesCanonico) {
        const canon = normalizeCatalogValue(c);
        if (!canon) continue;
        const fold = foldForMatch(canon);
        if (!fold) continue;
        if (map.has(fold) && map.get(fold) !== canon) {
            warnings.push(
                `Colisión de normalización: "${map.get(fold)}" y "${canon}" comparten la misma clave interna; se usa "${map.get(fold)}".`
            );
            continue;
        }
        if (!map.has(fold)) map.set(fold, canon);
    }
    return { map, warnings };
}

/**
 * Resuelve un texto del Excel al nombre canónico en BD (como en el desplegable del formulario).
 * @param {string} raw
 * @param {Map<string, string>} foldToCanonico
 * @returns {string|null}
 */
function matchExcelClienteABd(raw, foldToCanonico) {
    const fold = foldForMatch(raw);
    if (!fold) return null;
    return foldToCanonico.get(fold) || null;
}

/**
 * Busca la lista de cargos en `cargos_por_cliente` alineando el nombre del cliente con las claves del mapa.
 */
function lookupCargosPorClienteMap(cargosPorCliente, clienteSeleccionado) {
    const name = normalizeCatalogValue(clienteSeleccionado);
    if (!name || !cargosPorCliente || typeof cargosPorCliente !== 'object' || Array.isArray(cargosPorCliente)) {
        return [];
    }

    const exact = cargosPorCliente[name];
    if (Array.isArray(exact) && exact.length > 0) return exact;

    const foldSel = foldForMatch(name);
    if (foldSel) {
        for (const k of Object.keys(cargosPorCliente)) {
            if (foldForMatch(k) === foldSel) {
                const list = cargosPorCliente[k];
                if (Array.isArray(list) && list.length > 0) return list;
            }
        }
    }

    return [];
}

module.exports = {
    foldForMatch,
    buildFoldToCanonicoMap,
    matchExcelClienteABd,
    lookupCargosPorClienteMap
};
