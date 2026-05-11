/**
 * Cargos del cotizador: solo PostgreSQL (`catalogos.cargos_por_cliente`), por nombre de cliente.
 * No se usa el catálogo global `cargos` (legacy); debe quedar vacío o ignorarse.
 */
const { lookupCargosPorClienteMap } = require('./clienteNombreMatch');

function resolveCargosLista(catalogos, cliente) {
    return lookupCargosPorClienteMap(catalogos?.cargos_por_cliente, cliente);
}

module.exports = { resolveCargosLista, lookupCargosPorClienteMap };
