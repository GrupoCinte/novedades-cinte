/**
 * Mapeo ficha → pastillas del estante (AUT-312).
 * Día uno: un contrato cabecera. AUT-313 agregará N filas reales.
 */
export function contratosFromFicha(form, { esBaja = false } = {}) {
    const cliente = String(form?.cliente || form?.cliente_proyecto || '').trim();
    const tipo = String(form?.tipo_contrato || '').trim();
    const termino = String(form?.fecha_termino || '').slice(0, 10);
    return [
        {
            id: 'cabecera',
            cliente: cliente || 'Sin cliente',
            tipo,
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
