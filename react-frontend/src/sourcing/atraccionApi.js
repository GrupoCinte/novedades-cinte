function readCookie(name) {
    const raw = typeof document !== 'undefined' ? String(document.cookie || '') : '';
    if (!raw) return '';
    for (const part of raw.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

export function readCookieFromDocument(name) {
    return readCookie(name);
}

export function parseAtraccionApiError(data, fallback = 'Error en la solicitud') {
    if (!data || typeof data !== 'object') return fallback;
    if (data.error) return String(data.error);
    if (data.message) return String(data.message);
    if (data.detail) return String(data.detail);
    return fallback;
}

export function atraccionAuthHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

export async function fetchAtraccionHealth(token) {
    const res = await fetch('/api/atraccion/health', {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchVacantes(token) {
    const res = await fetch('/api/atraccion/vacantes', {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.vacantes) ? data.vacantes : [];
}

export async function createVacante(token, payload) {
    const res = await fetch('/api/atraccion/vacantes', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function updateVacanteCriterios(token, vacanteId, payload) {
    const id = String(vacanteId || '').trim();
    if (!id) throw new Error('Vacante sin identificador — recargue la página e intente de nuevo');
    const url = `/api/atraccion/vacantes/${encodeURIComponent(id)}/criterios`;
    const opts = {
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    };
    let res = await fetch(url, { method: 'PATCH', ...opts });
    if (res.status === 404) {
        res = await fetch(url, { method: 'POST', ...opts });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = parseAtraccionApiError(data, res.statusText);
        if (res.status === 404 && msg === 'Not Found') {
            throw new Error(
                'Ruta de confirmación no disponible. Reinicie el backend (npm run dev) con ATRACCION_TALENTO_MODULE_ENABLED=true.'
            );
        }
        throw new Error(msg);
    }
    return data;
}

export async function createSourcingJob(token, payload) {
    const res = await fetch('/api/atraccion/jobs', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchJob(token, jobId) {
    let res;
    try {
        res = await fetch(`/api/atraccion/jobs/${jobId}`, {
            headers: atraccionAuthHeaders(token),
            credentials: 'include'
        });
    } catch {
        throw new Error('No se pudo contactar al servidor. Verifique que el backend esté activo.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchRecentCandidatos(token, { limit } = {}) {
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
    const res = await fetch(`/api/atraccion/candidatos${qs}`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchVacanteCandidatos(token, vacanteId) {
    const res = await fetch(`/api/atraccion/vacantes/${vacanteId}/candidatos`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchIntegraciones(token) {
    const res = await fetch('/api/atraccion/integraciones', {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.integraciones) ? data.integraciones : [];
}

export async function connectIntegracionWorker(token, provider) {
    const res = await fetch(`/api/atraccion/integraciones/${provider}/connect-worker`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = parseAtraccionApiError(data, res.statusText);
        if (res.status === 404) {
            throw new Error(
                'Ruta connect-worker no encontrada. Reinicie el backend (npm run dev en la raíz) con ATRACCION_TALENTO_MODULE_ENABLED=true.'
            );
        }
        if (res.status === 502 && /not found/i.test(msg)) {
            throw new Error(
                'El worker no respondió en :8090. Inicie sourcing-worker (python main.py) y vuelva a intentar.'
            );
        }
        throw new Error(msg);
    }
    return data;
}

export async function fetchIntegracionWorkerStatus(token, provider) {
    const res = await fetch(`/api/atraccion/integraciones/${provider}/connect-worker/status`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data;
}

export async function connectIntegracion(token, provider) {
    const res = await fetch(`/api/atraccion/integraciones/${provider}/connect`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function disconnectIntegracion(token, provider) {
    const res = await fetch(`/api/atraccion/integraciones/${provider}/disconnect`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}
