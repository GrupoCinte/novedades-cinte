/**
 * Cargos del cotizador: solo PostgreSQL (`catalogos.cargos_por_cliente`), por nombre de cliente.
 * No se usa el catálogo global `cargos` (legacy); debe quedar vacío o ignorarse.
 */
const { lookupCargosPorClienteMap } = require('./clienteNombreMatch');

const CPP_KEYS = ['cargos_por_cliente', 'cargosPorCliente', 'CARGOS_POR_CLIENTE'];

/**
 * Devuelve el mapa/array de cargos por cliente (clave canónica u homónimos; JSON serializado como string).
 */
function pickCargosPorClienteRaw(catalogos) {
    if (!catalogos || typeof catalogos !== 'object') return undefined;
    for (const k of CPP_KEYS) {
        let v = catalogos[k];
        if (v == null) continue;
        if (typeof v === 'string') {
            const t = v.trim();
            if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
                try {
                    v = JSON.parse(t);
                } catch {
                    continue;
                }
            } else {
                continue;
            }
        }
        if (v && typeof v === 'object') return v;
    }
    return undefined;
}

function resolveCargosLista(catalogos, cliente) {
    return lookupCargosPorClienteMap(pickCargosPorClienteRaw(catalogos), cliente);
}

module.exports = { resolveCargosLista, lookupCargosPorClienteMap, pickCargosPorClienteRaw };
