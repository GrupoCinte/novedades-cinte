function buildQuery(filters = {}) {
    const params = new URLSearchParams();
    if (filters.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
    if (filters.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
    if (filters.cedula) params.set('cedula', filters.cedula);
    const query = params.toString();
    return query ? `?${query}` : '';
}

export async function fetchMonitoreoActividades(filters = {}) {
    const response = await fetch(`/api/admin/actividades${buildQuery(filters)}`, { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error || 'No fue posible cargar las actividades.');
    return Array.isArray(body.items) ? body.items : [];
}
