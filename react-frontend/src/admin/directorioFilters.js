function activoLabel(value) {
    if (value === 'true') return 'Activos';
    if (value === 'false') return 'Inactivos';
    return 'Todos';
}

function countActiveFilters(entries) {
    return entries.filter(([, active]) => active).length;
}

export function buildClienteChipLabel({ activo, pageSize }) {
    return `${activoLabel(activo)} · ${pageSize} filas`;
}

export function buildConsultoresChipLabel({ activo, tipoContrato, pageSize }) {
    const parts = [activoLabel(activo)];
    if (String(tipoContrato || '').trim()) parts.push(String(tipoContrato).trim());
    parts.push(`${pageSize} filas`);
    return parts.join(' · ');
}

export function buildReubicacionesChipLabel({ q, fechaFinDesde, fechaFinHasta, estado, pageSize }) {
    const n = countActiveFilters([
        [q, String(q || '').trim()],
        [fechaFinDesde, String(fechaFinDesde || '').trim()],
        [fechaFinHasta, String(fechaFinHasta || '').trim()],
        [estado, String(estado || '').trim()]
    ]);
    if (n === 0) return `Todos · ${pageSize} filas`;
    return `${n} filtro${n === 1 ? '' : 's'} · ${pageSize} filas`;
}

export function buildMallasChipLabel({ cliente }) {
    const c = String(cliente || '').trim();
    return c || 'Sin cliente';
}

export function buildCatalogoTiChipLabel({ limit }) {
    return `Todos · ${limit}/pág`;
}

export const CLIENTE_FILTER_DEFAULTS = { activo: 'true', pageSize: 10, q: '' };
export const CONSULTORES_FILTER_DEFAULTS = { activo: 'all', tipoContrato: '', pageSize: 10, q: '' };
export const REUBICACIONES_FILTER_DEFAULTS = {
    q: '',
    fechaFinDesde: '',
    fechaFinHasta: '',
    estado: '',
    pageSize: 20
};
export const MALLAS_FILTER_DEFAULTS = { cliente: '' };
export const CATALOGO_TI_FILTER_DEFAULTS = { limit: 20, q: '' };
