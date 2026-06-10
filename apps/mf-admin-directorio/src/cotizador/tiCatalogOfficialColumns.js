/**
 * Columnas fijas de la hoja «Taxonomía Depurada FIN».
 * La UI del catálogo TI siempre muestra todas estas columnas, con valor vacío si aún no hay dato en la fila.
 * (Orden y nombres alineados al inventario del libro oficial.)
 */
export const TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS = [
    'Rol original (Cinte)',
    '¿Duplicado?',
    'Categoría estándar',
    'Nombre de mercado (EN)',
    'Subfamilia',
    'Nivel sugerido',
    'Notas / Acción recomendada',
    'Banda Salarial Inferior (COP)',
    'Banda Salarial Superior (COP)',
    'Tipo de salario',
    'Salario asignado',
    'Base Salarial',
    'Porcentaje de flexibilizacion',
    'Flexible',
    'Cantidad de recargos nocturnos ordinarios',
    'Valor recargos',
    'Medicina Prepagada',
    'Auxilio de trasnporte',
    'Dotación',
    'Total devengo',
    'No exonerados',
    'Salud',
    'Pension',
    'ARL',
    'Parafiscales',
    'Cesantias',
    'Intereses de cesantias',
    'Prima de servicios',
    'Vacaciones',
    'Total carga prestacional',
    'Total Costo',
    'Columna_32',
    'Columna_33',
    'Columna_34',
    'Columna_35',
    'Columna_36',
    'Columna_37'
];

/** Columnas oficiales + cualquier clave extra guardada en la fila (no listada en el catálogo fijo). */
export function catalogHeadersForRow(row) {
    const cells = row?.cells && typeof row.cells === 'object' ? row.cells : {};
    const out = [...TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS];
    const seen = new Set(out);
    for (const k of Object.keys(cells)) {
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}

/** Objeto vacío con todas las columnas oficiales (para crear fila). */
export function emptyCellsOfficial() {
    return Object.fromEntries(TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS.map((h) => [h, '']));
}
