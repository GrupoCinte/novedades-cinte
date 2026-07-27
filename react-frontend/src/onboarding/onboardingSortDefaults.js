export const PERSONAL_DEFAULT_SORT = { key: 'fecha_ingreso', dir: 'asc' };
export const LICENCIAS_DEFAULT_SORT = { key: 'inicio_licencia', dir: 'asc' };
export const EXTRANJEROS_DEFAULT_SORT = { key: 'fecha_vencimiento', dir: 'asc' };
export const CANCELACIONES_DEFAULT_SORT = { key: 'fecha_evento', dir: 'asc' };

export function toggleSort(current, columnKey) {
    if (current.key === columnKey) {
        return { key: columnKey, dir: current.dir === 'asc' ? 'desc' : 'asc' };
    }
    return { key: columnKey, dir: 'asc' };
}
