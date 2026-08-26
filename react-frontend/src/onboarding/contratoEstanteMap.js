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

/**
 * Mapeo ficha → pastillas del estante.
 * AUT-313: usa `contratos` reales si vienen de la API; si no, la cabecera de la fila.
 */
export function contratosFromFicha(form, { esBaja = false } = {}) {
    if (Array.isArray(form?.contratos) && form.contratos.length) {
        return form.contratos.map((c) => mapContratoApi(c, { esBaja })).filter(Boolean);
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
