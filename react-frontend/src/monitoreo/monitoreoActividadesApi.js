const BASE = '/api/admin/actividades';

export async function fetchMonitoreoActividades({ fechaDesde, fechaHasta, cedula, cliente } = {}) {
    const params = new URLSearchParams();
    if (fechaDesde) params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params.set('fechaHasta', fechaHasta);
    if (cedula) params.set('cedula', cedula);
    if (cliente) params.set('cliente', cliente);
    const url = params.toString() ? `${BASE}?${params}` : BASE;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Error ${res.status}`);
    }
    const body = await res.json();
    return body?.items || [];
}

export async function patchActividadEstado(id, { estado, observaciones } = {}) {
    const csrfToken = (() => {
        const raw = String(document?.cookie || '');
        if (!raw) return '';
        const part = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith('cinteXsrf='));
        return part ? decodeURIComponent(part.slice('cinteXsrf='.length)) : '';
    })();

    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['x-cinte-xsrf'] = csrfToken;

    const res = await fetch(`${BASE}/${id}/estado`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ estado, observaciones })
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('PATCH ERROR RESP:', res.status, text);
        let body = {};
        try { body = JSON.parse(text); } catch (e) {}
        throw new Error(body?.error || `Error ${res.status} al intentar contactar al servidor.`);
    }
    return res.json();
}
