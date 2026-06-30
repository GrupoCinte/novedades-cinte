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
    const res = await fetch('/api/conciliaciones/clientes', { headers: conciliacionesAuthHeaders(token), credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar clientes'));
    return Array.isArray(data.clientes) ? data.clientes : [];
}

export async function fetchConciliacionesDashboardResumen(token, { year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await fetch(`/api/conciliaciones/dashboard-resumen?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar dashboard'));
    return data;
}

export async function fetchConciliacionPorCliente(token, { cliente, year, month, billingType, billingMode, baseHours }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const clienteTrim = String(cliente || '').trim();
    if (clienteTrim) q.set('cliente', clienteTrim);
    const bt = String(billingType || '').trim();
    if (bt) q.set('billingType', bt);
    const bm = String(billingMode || '').trim();
    if (bm) q.set('billingMode', bm);
    if (baseHours != null && baseHours !== '') {
        const bh = Number(baseHours);
        if (Number.isFinite(bh) && bh > 0) q.set('baseHours', String(bh));
    }
    const res = await fetch(`/api/conciliaciones/por-cliente?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar resumen'));
    return data;
}

export async function fetchConciliacionNovedadesDetalle(token, { cliente, cedula, year, month, billingType, billingMode, baseHours }) {
    const q = new URLSearchParams({
        cliente: String(cliente || ''),
        cedula: String(cedula || ''),
        year: String(year),
        month: String(month)
    });
    const bt = String(billingType || '').trim();
    if (bt) q.set('billingType', bt);
    const bm = String(billingMode || '').trim();
    if (bm) q.set('billingMode', bm);
    if (baseHours != null && baseHours !== '') {
        const bh = Number(baseHours);
        if (Number.isFinite(bh) && bh > 0) q.set('baseHours', String(bh));
    }
    const res = await fetch(`/api/conciliaciones/novedades-detalle?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar detalle'));
    return {
        items: Array.isArray(data.items) ? data.items : [],
        billingMode: data.billingMode ?? null,
        baseHours: data.baseHours ?? null,
        horasBaseMes: data.horasBaseMes ?? null,
        tarifaValorHora: data.tarifaValorHora ?? null,
        tarifaCliente: data.tarifaCliente ?? null,
        tarifaMaestro: data.tarifaMaestro ?? null,
        tarifaAjustada: Boolean(data.tarifaAjustada),
        facturaCop: data.facturaCop ?? null
    };
}

export async function postFacturacionAjustes(token, payload) {
    const res = await fetch('/api/conciliaciones/facturacion/ajustes', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al guardar ajustes'));
    return data.data;
}

export async function saveConciliacionFacturacion(token, payload) {
    const res = await fetch('/api/conciliaciones/facturacion', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al guardar facturación'));
    return data.data;
}

export async function postFacturacionRevision(token, payload) {
    const res = await fetch('/api/conciliaciones/facturacion/revision', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al registrar revisión'));
    return data.data;
}

export async function postFacturacionRevisionMasiva(token, payload) {
    const res = await fetch('/api/conciliaciones/facturacion/revision/masiva', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al procesar revisión masiva'));
    return data.data;
}

export async function fetchFacturacionHistorial(token, { cedula, anio, mes }) {
    const q = new URLSearchParams({
        cedula: String(cedula || ''),
        anio: String(anio),
        mes: String(mes)
    });
    const res = await fetch(`/api/conciliaciones/facturacion/historial?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar historial'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function saveConciliacionFacturacionMasiva(token, payload) {
    const res = await fetch('/api/conciliaciones/facturacion/masiva', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify(payload),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al procesar acción masiva'));
    return data.data;
}

export async function deleteConciliacionFacturacion(token, { cedula, anio, mes, observacion }) {
    const res = await fetch('/api/conciliaciones/facturacion', {
        method: 'DELETE',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify({ cedula, anio, mes, observacion }),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al revertir el cierre'));
    return data;
}

export async function fetchDashboardLiderCliente(token, { year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await fetch(`/api/conciliaciones/facturacion/dashboard-lider-cliente?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar datos líder × cliente'));
    return data;
}

export function conciliacionExportExcelUrl({ servicioId, year, month }) {
    const q = new URLSearchParams({
        servicioId: String(servicioId),
        year: String(year),
        month: String(month)
    });
    return `/api/conciliaciones/facturacion/export-excel?${q}`;
}

export async function downloadConciliacionExportExcel(token, { servicioId, year, month }) {
    const url = conciliacionExportExcelUrl({ servicioId, year, month });
    const res = await fetch(url, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al descargar Excel'));
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] || `conciliacion_${year}-${month}.xlsx`;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
}

export async function postMarcarServicioConciliada(token, { servicioId, anio, mes }) {
    const res = await fetch('/api/conciliaciones/facturacion/servicio-cierre/conciliar', {
        method: 'POST',
        headers: conciliacionesAuthHeaders(token),
        body: JSON.stringify({ servicioId, anio, mes }),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al marcar conciliada'));
    return data;
}

export async function fetchColaCierres(token, { year, month, cliente }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const clienteTrim = String(cliente || '').trim();
    if (clienteTrim) q.set('cliente', clienteTrim);
    const res = await fetch(`/api/conciliaciones/facturacion/cola-cierres?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar cola de cierres'));
    return data;
}

export async function fetchConciliacionesFacturacionList(token, { year, month }) {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await fetch(`/api/conciliaciones/facturacion?${q}`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar listado de facturaciones'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function fetchServicios(token) {
    const res = await fetch('/api/conciliaciones/servicios', {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar servicios'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function createServicio(token, payload) {
    const res = await fetch('/api/conciliaciones/servicios', {
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
    const res = await fetch(`/api/conciliaciones/servicios/${idServicio}/consultores`, {
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al cargar consultores del servicio'));
    return Array.isArray(data.items) ? data.items : [];
}

export async function associateConsultoresToServicio(token, idServicio, cedulas) {
    const res = await fetch(`/api/conciliaciones/servicios/${idServicio}/consultores`, {
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
    const res = await fetch(`/api/conciliaciones/servicios/${idServicio}`, {
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
    const res = await fetch(`/api/conciliaciones/servicios/${idServicio}`, {
        method: 'DELETE',
        headers: conciliacionesAuthHeaders(token),
        credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseConciliacionesApiError(data, res.statusText || 'Error al eliminar servicio'));
    return data;
}
