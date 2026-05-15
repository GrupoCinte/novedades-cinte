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

export function authHeadersForDirectorio(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

async function fetchJsonOk(token, url, signal = undefined) {
    /** Igual que conciliaciones: cookie `cinteSession` puede autenticar sin Bearer en memoria. */
    const res = await fetch(url, { credentials: 'include', headers: authHeadersForDirectorio(token), signal });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
}

/** Paginación completa: clientes-resumen (máx. 2000 por página en API). */
export async function fetchAllClientesResumen(token, activo = 'true', signal = undefined) {
    const out = [];
    let offset = 0;
    const limit = 2000;
    for (let guard = 0; guard < 200; guard++) {
        const u = new URLSearchParams({ activo, limit: String(limit), offset: String(offset) });
        const j = await fetchJsonOk(token, `/api/directorio/clientes-resumen?${u}`, signal);
        const items = j.items || [];
        out.push(...items);
        const total = Number(j.total) || 0;
        if (out.length >= total || items.length < limit) break;
        offset += limit;
    }
    return out;
}

/** Paginación completa: colaboradores (máx. 200 por página en API). */
export async function fetchAllColaboradores(token, activo = 'all', signal = undefined) {
    const out = [];
    let offset = 0;
    const limit = 200;
    for (let guard = 0; guard < 500; guard++) {
        const u = new URLSearchParams({ activo, limit: String(limit), offset: String(offset) });
        const j = await fetchJsonOk(token, `/api/directorio/colaboradores?${u}`, signal);
        const items = j.items || [];
        out.push(...items);
        const total = Number(j.total) || 0;
        if (out.length >= total || items.length < limit) break;
        offset += limit;
    }
    return out;
}

/** Paginación completa: reubicaciones pipeline (máx. 200 por página en API). */
export async function fetchAllReubicacionesPipeline(token, signal = undefined) {
    const out = [];
    let offset = 0;
    const limit = 200;
    for (let guard = 0; guard < 500; guard++) {
        const u = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        const j = await fetchJsonOk(token, `/api/directorio/reubicaciones-pipeline?${u}`, signal);
        const items = j.items || [];
        out.push(...items);
        const total = Number(j.total) || 0;
        if (out.length >= total || items.length < limit) break;
        offset += limit;
    }
    return out;
}

/** Una sola petición: métricas agregadas en servidor (dashboard administración). */
export async function fetchAdminDashboardMetrics(token, signal = undefined) {
    const res = await fetch('/api/directorio/admin-dashboard-metrics', {
        credentials: 'include',
        headers: authHeadersForDirectorio(token),
        signal
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
}
