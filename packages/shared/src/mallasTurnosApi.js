function readCookie(name) {
    const raw = typeof document !== 'undefined' ? String(document.cookie || '') : '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

export function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

export async function fetchMallasTurnos(token, cliente, desde, hasta) {
    const qs = new URLSearchParams({ cliente, desde, hasta });
    const res = await fetch(`/api/directorio/mallas-turnos?${qs}`, {
        headers: authHeaders(token)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export async function putMallasTurnos(token, { cliente, patches }) {
    const res = await fetch('/api/directorio/mallas-turnos', {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ cliente, patches })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}
