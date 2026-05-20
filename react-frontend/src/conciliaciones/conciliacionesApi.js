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

export function conciliacionesAuthHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

export async function fetchConciliacionesClientes(token) {
    const res = await fetch('/api/conciliaciones/clientes', { headers: conciliacionesAuthHeaders(token), credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Error al cargar clientes');
    return Array.isArray(data.clientes) ? data.clientes : [];
}

export async function fetchConciliacionesDashboardResumen(token, { year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await fetch(`/api/conciliaciones/dashboard-resumen?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Error al cargar dashboard');
    return data;
}

export async function fetchConciliacionPorCliente(token, { cliente, year, month }) {
    const q = new URLSearchParams({ cliente: String(cliente || ''), year: String(year), month: String(month) });
    const res = await fetch(`/api/conciliaciones/por-cliente?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Error al cargar resumen');
    return data;
}

export async function fetchConciliacionNovedadesDetalle(token, { cliente, cedula, year, month }) {
    const q = new URLSearchParams({
        cliente: String(cliente || ''),
        cedula: String(cedula || ''),
        year: String(year),
        month: String(month)
    });
    const res = await fetch(`/api/conciliaciones/novedades-detalle?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Error al cargar detalle');
    return Array.isArray(data.items) ? data.items : [];
}
