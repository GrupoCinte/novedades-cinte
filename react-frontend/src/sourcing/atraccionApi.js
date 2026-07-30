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

export async function archiveVacante(token, vacanteId) {
    const id = String(vacanteId || '').trim();
    if (!id) throw new Error('Vacante sin identificador');
    const res = await fetch(`/api/atraccion/vacantes/${encodeURIComponent(id)}/archivar`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
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

export async function fetchCapturaCandidatos(token, { q = '', fuente = '', limit } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (fuente) params.set('fuente', fuente);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/atraccion/captura${qs}`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.candidatos) ? data.candidatos : [];
}

export async function setCandidatoDecision(token, candidatoId, decision) {
    const id = String(candidatoId || '').trim();
    if (!id) throw new Error('Candidato sin identificador');
    const res = await fetch(`/api/atraccion/candidatos/${encodeURIComponent(id)}/decision`, {
        method: 'PATCH',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ decision })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function deleteCandidato(token, candidatoId) {
    const id = String(candidatoId || '').trim();
    if (!id) throw new Error('Candidato sin identificador');
    const res = await fetch(`/api/atraccion/candidatos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
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

export async function fetchVacantesStats(token) {
    const res = await fetch('/api/atraccion/vacantes/stats', {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.stats) ? data.stats : [];
}

export async function fetchVacantePreentrevistas(token, vacanteId) {
    const res = await fetch(`/api/atraccion/vacantes/${encodeURIComponent(vacanteId)}/preentrevistas`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.preentrevistas) ? data.preentrevistas : [];
}

export async function fetchCampanas(token) {
    const res = await fetch('/api/atraccion/campanas', {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.campanas) ? data.campanas : [];
}

export async function fetchCampana(token, id) {
    const res = await fetch(`/api/atraccion/campanas/${encodeURIComponent(id)}`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data.campana || null;
}

export async function createCampana(token, payload) {
    const res = await fetch('/api/atraccion/campanas', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data.campana || null;
}

export async function updateCampana(token, campanaId, payload) {
    const res = await fetch(`/api/atraccion/campanas/${encodeURIComponent(campanaId)}`, {
        method: 'PATCH',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data.campana || null;
}

export async function addCampanaDestinatarios(token, campanaId, { candidatoIds = [], manuales = [] } = {}) {
    const res = await fetch(`/api/atraccion/campanas/${encodeURIComponent(campanaId)}/destinatarios`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ candidato_ids: candidatoIds, manuales })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function deleteCampanaDestinatario(token, campanaId, destinatarioId) {
    const res = await fetch(
        `/api/atraccion/campanas/${encodeURIComponent(campanaId)}/destinatarios/${encodeURIComponent(destinatarioId)}`,
        {
            method: 'DELETE',
            headers: atraccionAuthHeaders(token),
            credentials: 'include'
        }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function updateCampanaDestinatario(token, campanaId, destinatarioId, payload) {
    const res = await fetch(
        `/api/atraccion/campanas/${encodeURIComponent(campanaId)}/destinatarios/${encodeURIComponent(destinatarioId)}`,
        {
            method: 'PATCH',
            headers: atraccionAuthHeaders(token),
            credentials: 'include',
            body: JSON.stringify(payload)
        }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function enviarCampana(token, campanaId) {
    const res = await fetch(`/api/atraccion/campanas/${encodeURIComponent(campanaId)}/enviar`, {
        method: 'POST',
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

export async function saveZohoTokens(token, payload) {
    const res = await fetch('/api/atraccion/integraciones/zoho/tokens', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function disconnectZoho(token) {
    const res = await fetch('/api/atraccion/integraciones/zoho', {
        method: 'DELETE',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function createPostulacionesJob(token, payload) {
    const res = await fetch('/api/atraccion/jobs/postulaciones', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function createRediscoveryJob(token, vacanteId) {
    const res = await fetch('/api/atraccion/jobs/rediscovery', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ vacante_id: vacanteId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function enrichCandidato(token, candidatoId) {
    const res = await fetch(`/api/atraccion/candidatos/${encodeURIComponent(candidatoId)}/enriquecer`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function generarOferta(token, vacanteId) {
    const res = await fetch(`/api/atraccion/vacantes/${encodeURIComponent(vacanteId)}/generar-oferta`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function saveVacanteTextoOferta(token, vacanteId, textoOferta) {
    const res = await fetch(`/api/atraccion/vacantes/${encodeURIComponent(vacanteId)}/texto-oferta`, {
        method: 'PATCH',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ texto_oferta: textoOferta })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function publicarVacante(token, vacanteId, canal, textoOferta) {
    const res = await fetch(`/api/atraccion/vacantes/${encodeURIComponent(vacanteId)}/publicar/${canal}`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ texto_oferta: textoOferta })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchPublicaciones(token, vacanteId) {
    const res = await fetch(`/api/atraccion/vacantes/${encodeURIComponent(vacanteId)}/publicaciones`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.publicaciones) ? data.publicaciones : [];
}

export async function fetchFlujos(token) {
    const res = await fetch('/api/atraccion/flujos', {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.flujos) ? data.flujos : [];
}

export async function createFlujo(token, payload) {
    const res = await fetch('/api/atraccion/flujos', {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data.flujo;
}

export async function deleteFlujo(token, flujoId) {
    const res = await fetch(`/api/atraccion/flujos/${encodeURIComponent(flujoId)}`, {
        method: 'DELETE',
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function asignarFlujoCampana(token, campanaId, flujoId) {
    const res = await fetch(`/api/atraccion/campanas/${encodeURIComponent(campanaId)}/asignar-flujo`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ flujo_id: flujoId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}

export async function fetchFlujoCampanaProgress(token, campanaId) {
    const res = await fetch(`/api/atraccion/flujos/campana/${encodeURIComponent(campanaId)}`, {
        headers: atraccionAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return Array.isArray(data.candidatos) ? data.candidatos : [];
}
