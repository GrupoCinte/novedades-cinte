import { apiFetch } from '@cinte/api-client';
function readCookie(name) {
    const raw = typeof document !== 'undefined' ? String(document.cookie || '') : '';
    if (!raw) return '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

/** Extrae mensaje legible de respuestas { error, errors[] } del API. */
export function parseConciliacionesApiError(data, fallback = 'Error en la solicitud') {
    if (!data || typeof data !== 'object') return fallback;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
        return data.errors.map((e) => e.message || e.field).filter(Boolean).join(' · ');
    }
    return String(data.error || fallback);
}

export function conciliacionesAuthHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

export async function fetchConciliacionesClientes(token) {
    const res = await apiFetch('/api/conciliaciones/clientes', { headers: conciliacionesAuthHeaders(token), credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar clientes'));
    return Array.isArray(data.clientes) ? data.clientes : [];
}

export async function fetchConciliacionesDashboardResumen(token, { year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await apiFetch(`/api/conciliaciones/dashboard-resumen?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar dashboard'));
    return data;
}

export async function fetchConciliacionPorCliente(token, { cliente, year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const clienteTrim = String(cliente || '').trim();
    if (clienteTrim) q.set('cliente', clienteTrim);
    const res = await apiFetch(`/api/conciliaciones/por-cliente?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar resumen'));
    return data;
}

export async function fetchConciliacionNovedadesDetalle(token, { cliente, cedula, year, month }) {
    const q = new URLSearchParams({
        cliente: String(cliente || ''),
        cedula: String(cedula || ''),
        year: String(year),
        month: String(month)
    });
    const res = await apiFetch(`/api/conciliaciones/novedades-detalle?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar detalle'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function saveConciliacionFacturacion(token, payload) {
    const res = await apiFetch('/api/conciliaciones/facturacion', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al guardar facturación'));
    return data.data;
}

export async function saveConciliacionFacturacionMasiva(token, payload) {
    const res = await apiFetch('/api/conciliaciones/facturacion/masiva', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al procesar acción masiva'));
    return data.data;
}

export async function fetchConciliacionesFacturacionList(token, { year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await apiFetch(`/api/conciliaciones/facturacion?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar listado de facturaciones'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function fetchServicios(token) {
    const res = await apiFetch('/api/conciliaciones/servicios', {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar servicios'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function createServicio(token, payload) {
    const res = await apiFetch('/api/conciliaciones/servicios', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al crear servicio'));
    return data.data;
}

export async function fetchServicioConsultores(token, idServicio) {
    const res = await apiFetch(`/api/conciliaciones/servicios/${idServicio}/consultores`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar consultores del servicio'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function associateConsultoresToServicio(token, idServicio, cedulas) {
    const res = await apiFetch(`/api/conciliaciones/servicios/${idServicio}/consultores`, {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify({ cedulas }),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al asociar consultores al servicio'));
    return data;
}

export async function updateServicio(token, idServicio, payload) {
    const res = await apiFetch(`/api/conciliaciones/servicios/${idServicio}`, {
        method: 'PUT',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al actualizar servicio'));
    return data.data;
}

export async function deleteServicio(token, idServicio) {
    const res = await apiFetch(`/api/conciliaciones/servicios/${idServicio}`, {
        method: 'DELETE',
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al eliminar servicio'));
    return data;
}
