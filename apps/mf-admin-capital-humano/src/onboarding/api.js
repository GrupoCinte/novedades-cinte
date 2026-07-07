import axios from 'axios';

const API_PREFIX = '/api/onboarding';

const AXIOS_CRED = { withCredentials: true };
const AXIOS_TIMEOUT_MS = 30000;
const baseUrl = import.meta.env.VITE_API_URL || 'https://small-bobcats-throw.loca.lt';
axios.defaults.baseURL = baseUrl;
axios.defaults.headers.common['Bypass-Tunnel-Reminder'] = 'true';

function authHeaders(token) {
    const t = String(token || '').trim();
    if (!t) return {};
    return { Authorization: `Bearer ${t}` };
}

function xsrfFromCookie() {
    try {
        const m = document.cookie.match(/(?:^|;\s*)cinteXsrf=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    } catch {
        return '';
    }
}

function writeHeaders(token) {
    return { ...authHeaders(token), 'x-cinte-xsrf': xsrfFromCookie() };
}

async function get(token, path, params) {
    const res = await axios.get(`${API_PREFIX}${path}`, {
        ...AXIOS_CRED,
        headers: authHeaders(token),
        params,
        timeout: AXIOS_TIMEOUT_MS
    });
    return res.data;
}

async function post(token, path, body) {
    const res = await axios.post(`${API_PREFIX}${path}`, body, {
        ...AXIOS_CRED,
        headers: writeHeaders(token),
        timeout: AXIOS_TIMEOUT_MS
    });
    return res.data;
}

async function put(token, path, body) {
    const res = await axios.put(`${API_PREFIX}${path}`, body, {
        ...AXIOS_CRED,
        headers: writeHeaders(token),
        timeout: AXIOS_TIMEOUT_MS
    });
    return res.data;
}

async function patch(token, path, body) {
    const res = await axios.patch(`${API_PREFIX}${path}`, body, {
        ...AXIOS_CRED,
        headers: writeHeaders(token),
        timeout: AXIOS_TIMEOUT_MS
    });
    return res.data;
}

export const onboardingApi = {
    listPersonal: (token, params) => get(token, '/personal', params),
    listProximos: (token, params) => get(token, '/proximos', params),
    listBajas: (token, params) => get(token, '/bajas', params),
    listSena: (token, params) => get(token, '/sena', params),
    listStaff: (token, params) => get(token, '/staff', params),
    getPersonal: (token, cedula) => get(token, `/personal/${encodeURIComponent(cedula)}`),
    createPersonal: (token, body) => post(token, '/personal', body),
    patchPersonal: (token, cedula, body) => patch(token, `/personal/${encodeURIComponent(cedula)}`, body),
    listLicencias: (token, params) => get(token, '/licencias', params),
    listExtranjeros: (token, params) => get(token, '/documentos-extranjeros', params),
    listPolizas: (token, params) => get(token, '/polizas', params),
    listCapacitaciones: (token, params) => get(token, '/capacitaciones', params),
    getCalculadora: (token, cedula) => get(token, `/calculadora/${encodeURIComponent(cedula)}`),
    putCalculadora: (token, cedula, body) => put(token, `/calculadora/${encodeURIComponent(cedula)}`, body),
    putExtranjeros: (token, cedula, body) => put(token, `/documentos-extranjeros/${encodeURIComponent(cedula)}`, body),
    postLicencia: (token, body) => post(token, '/licencias', body),
    postPoliza: (token, body) => post(token, '/polizas', body),
    postCapacitacion: (token, body) => post(token, '/capacitaciones', body),
    marcarBaja: (token, cedula, body) => patch(token, `/personal/${encodeURIComponent(cedula)}/baja`, body),
    catalogoMotivoBaja: (token) => get(token, '/catalogos/motivo-baja'),
    catalogoCiudades: (token) => get(token, '/catalogos/ciudades'),
    reporteRotacion: (token, params) => get(token, '/reportes/rotacion', params),
    reporteGraficas: (token, params) => get(token, '/reportes/graficas', params),
    health: (token) => get(token, '/health')
};

export default onboardingApi;
