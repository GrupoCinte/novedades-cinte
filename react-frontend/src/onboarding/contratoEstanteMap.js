function foldCliente(value) {
    return String(value || '').trim().toLocaleLowerCase('es');
}

function mapContratoApi(c, { esBaja = false } = {}) {
    const id = String(c?.id || c?.contrato_id || '').trim();
    if (!id) return null;
    const vigenteApi = c.vigente !== false;
    return {
        id,
        cliente: String(c.cliente || 'Sin cliente').trim() || 'Sin cliente',
        tipo: String(c.tipo || c.tipo_contrato || '').trim(),
        fechaInicio: String(c.fechaInicio || c.fecha_inicio || '').slice(0, 10),
        fechaTermino: String(c.fechaTermino || c.fecha_termino || '').slice(0, 10),
        vigente: vigenteApi && !esBaja,
        esCabecera: Boolean(c.esCabecera ?? c.es_cabecera)
    };
}

/** Alinea el cliente de la pastilla con la opción exacta del catálogo para que el select no quede en blanco. */
export function matchClienteOption(value, options) {
    const cur = String(value || '').trim();
    if (!cur) return '';
    const list = Array.isArray(options) ? options : [];
    const hit = list.find((c) => foldCliente(c) === foldCliente(cur));
    return hit || cur;
}

export function clienteOptionsWithCurrent(options, current) {
    const list = (Array.isArray(options) ? options : []).map((c) => String(c || '').trim()).filter(Boolean);
    const cur = String(current || '').trim();
    if (cur && !list.some((c) => foldCliente(c) === foldCliente(cur))) list.unshift(cur);
    return list;
}

/**
 * Líder visible al cambiar de pastilla: si el actual no es del cliente, el asociado del catálogo.
 */
export function pickLiderForCliente(actual, options, { loading = false } = {}) {
    if (loading) return '';
    const list = (Array.isArray(options) ? options : []).map((v) => String(v || '').trim()).filter(Boolean);
    const cur = String(actual || '').trim();
    if (cur && list.some((l) => foldCliente(l) === foldCliente(cur))) return cur;
    return list[0] || '';
}

/** Una pastilla por cliente: vigente si existe; si no, el último histórico. */
export function collapseContratosEstante(list) {
    const rows = Array.isArray(list) ? list.filter(Boolean) : [];
    const vigentes = rows.filter((c) => c.vigente);
    const source = vigentes.length ? vigentes : rows;
    const seen = new Map();
    for (const c of source) {
        const key = foldCliente(c.cliente);
        if (!key || seen.has(key)) continue;
        seen.set(key, c);
    }
    return [...seen.values()];
}

/**
 * Mapeo ficha → pastillas del estante.
 * AUT-313: usa `contratos` reales si vienen de la API; si no, la cabecera de la fila.
 */
export function contratosFromFicha(form, { esBaja = false } = {}) {
    if (Array.isArray(form?.contratos) && form.contratos.length) {
        return collapseContratosEstante(form.contratos.map((c) => mapContratoApi(c, { esBaja })).filter(Boolean));
    }
    const cliente = String(form?.cliente || form?.cliente_proyecto || '').trim();
    const tipo = String(form?.tipo_contrato || '').trim();
    const termino = String(form?.fecha_termino || '').slice(0, 10);
    return [
        {
            id: 'cabecera',
            cliente: cliente || 'Sin cliente',
            tipo,
            fechaInicio: String(form?.fecha_ingreso || '').slice(0, 10),
            fechaTermino: termino,
            vigente: !esBaja,
            esCabecera: true
        }
    ];
}

export function historialForContrato(form, contratoId) {
    const list = Array.isArray(form?.contratos) ? form.contratos : [];
    const hit = list.find((c) => String(c.id) === String(contratoId));
    return Array.isArray(hit?.historial) ? hit.historial : [];
}

export function historialForFicha(form) {
    if (Array.isArray(form?.historial) && form.historial.length) return form.historial;
    const list = Array.isArray(form?.contratos) ? form.contratos : [];
    return list.flatMap((c) => (Array.isArray(c.historial) ? c.historial : []));
}

function loteKeyForEntry(entry) {
    if (entry?.loteId) return `lote:${entry.loteId}`;
    const ts = String(entry?.createdAt || '').slice(0, 19);
    const actor = String(entry?.actorEmail || entry?.actorNombre || '');
    const origen = String(entry?.origen || '');
    return `fb:${actor}:${origen}:${ts}`;
}

/** Un Guardar (o un lote) se muestra como un solo bloque, no como filas sueltas. */
export function groupHistorialBloques(items) {
    const list = Array.isArray(items) ? items : [];
    const order = [];
    const byKey = new Map();
    for (const entry of list) {
        if (!entry) continue;
        const key = loteKeyForEntry(entry);
        let bloque = byKey.get(key);
        if (!bloque) {
            bloque = {
                id: key,
                createdAt: entry.createdAt || null,
                actorNombre: entry.actorNombre || 'Sistema',
                actorEmail: entry.actorEmail || null,
                cambios: []
            };
            byKey.set(key, bloque);
            order.push(bloque);
        }
        bloque.cambios.push(entry);
        if (entry.createdAt && (!bloque.createdAt || String(entry.createdAt) > String(bloque.createdAt))) {
            bloque.createdAt = entry.createdAt;
        }
    }
    return order;
}

function toPositiveInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.trunc(n));
}

/** Vigentes extras además de la cabecera (el +N de la grilla). */
export function contratosVigentesExtra(row, { esBaja = false, extraContratos } = {}) {
    const fromApi = toPositiveInt(row?.contratos_vigentes_count ?? row?.contratos_vigentes);
    if (fromApi != null) return Math.max(0, fromApi - 1);

    const list = Array.isArray(extraContratos) && extraContratos.length
        ? extraContratos
        : contratosFromFicha(row, { esBaja });
    const vigentes = list.filter((c) => c && c.vigente).length;
    return Math.max(0, vigentes - 1);
}
