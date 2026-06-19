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

export async function fetchMallasTurnos(token, cliente, desde, hasta, origen) {
    const qs = new URLSearchParams({ cliente, desde, hasta });
    if (origen === 'mallas' || origen === 'nocturnos') qs.set('origen', origen);
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

export async function fetchMallaAprobacionStatus(token, { cliente, anio, mes, variant }) {
    const qs = new URLSearchParams({
        cliente,
        anio: String(anio),
        mes: String(mes),
        variant
    });
    const res = await fetch(`/api/directorio/mallas-turnos/aprobacion?${qs}`, {
        headers: authHeaders(token)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export async function postMallaAprobar(token, { cliente, anio, mes, variant }) {
    const res = await fetch('/api/directorio/mallas-turnos/aprobar', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ cliente, anio, mes, variant })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export async function fetchNocturnoConfig(token) {
    const res = await fetch('/api/directorio/mallas-turnos/nocturno-config', {
        headers: authHeaders(token)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export async function putNocturnoConfig(token, { horaInicio, horaFin }) {
    const res = await fetch('/api/directorio/mallas-turnos/nocturno-config', {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ horaInicio, horaFin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}
