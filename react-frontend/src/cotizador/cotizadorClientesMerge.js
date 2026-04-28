const CPP_KEYS = ['cargos_por_cliente', 'cargosPorCliente', 'CARGOS_POR_CLIENTE'];

/**
 * Misma resolución que el backend (`pickCargosPorClienteRaw`): clave canónica, alias y JSON en string.
 */
export function pickCargosPorClienteRaw(catalogos) {
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

/**
 * Lista unificada de clientes para el cotizador: API `clientes-formulario`, array `catalogos.clientes`
 * y nombres presentes en `catalogos.cargos_por_cliente` (muchas instalaciones tienen tarifas por clave
 * que no están en `clientes` ni llegaron por el endpoint).
 */
export function mergeCotizadorClienteRows(clientesLista, catalogos) {
    const byKey = new Map();
    const add = (nombreRaw, nitRaw = '') => {
        const nombre = String(nombreRaw || '').trim();
        if (!nombre) return;
        const k = nombre.toLowerCase();
        const nit = String(nitRaw || '').trim();
        if (!byKey.has(k)) {
            byKey.set(k, { nombre, nit });
        } else if (nit && !byKey.get(k).nit) {
            byKey.set(k, { nombre: byKey.get(k).nombre, nit });
        }
    };

    for (const c of Array.isArray(clientesLista) ? clientesLista : []) {
        add(c?.nombre || c?.name, c?.nit || '');
    }
    for (const c of Array.isArray(catalogos?.clientes) ? catalogos.clientes : []) {
        add(c?.nombre || c?.name, c?.nit || '');
    }

    const cpp = pickCargosPorClienteRaw(catalogos);
    if (cpp && typeof cpp === 'object' && !Array.isArray(cpp)) {
        for (const k of Object.keys(cpp)) add(k, '');
    } else if (Array.isArray(cpp)) {
        for (const entry of cpp) {
            add(
                entry?.cliente || entry?.CLIENTE || entry?.nombre || entry?.name || entry?.client,
                entry?.nit || entry?.NIT || ''
            );
        }
    }

    return [...byKey.values()].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
}
