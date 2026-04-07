/** Misma lógica que `src/cotizador/clienteNombreMatch.js` + `resolveCargosLista.js` (backend). */

function normalizeLikeCatalog(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function foldForMatch(value) {
    const t = normalizeLikeCatalog(value).toLowerCase();
    if (!t) return '';
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function lookupCargosPorClienteMap(cargosPorCliente, clienteSeleccionado) {
    const name = normalizeLikeCatalog(clienteSeleccionado);
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

export function resolveCargosLista(catalogos, cliente) {
    return lookupCargosPorClienteMap(catalogos?.cargos_por_cliente, cliente);
}
