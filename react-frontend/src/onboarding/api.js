import axios from 'axios';

const API_PREFIX = '/api/onboarding';

const AXIOS_CRED = { withCredentials: true };
const AXIOS_TIMEOUT_MS = 30000;

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
    getCalculadora: (token, cedula) => get(token, `/calculadora/${encodeURIComponent(cedula)}`),
    putCalculadora: (token, cedula, body) => put(token, `/calculadora/${encodeURIComponent(cedula)}`, body),
    putExtranjeros: (token, cedula, body) => put(token, `/documentos-extranjeros/${encodeURIComponent(cedula)}`, body),
    postLicencia: (token, body) => post(token, '/licencias', body),
    marcarBaja: (token, cedula, body) => patch(token, `/personal/${encodeURIComponent(cedula)}/baja`, body),
    catalogoMotivoBaja: (token) => get(token, '/catalogos/motivo-baja'),
    catalogoCiudades: (token) => get(token, '/catalogos/ciudades'),
    catalogoPuestos: (token) => get(token, '/catalogos/puestos'),
    /** DISTINCT desde colaboradores: sexo | tipo_contrato | profesion | tipo_identificacion | departamento | ciudad */
    catalogoColaboradorValores: (token, campo) =>
        get(token, `/catalogos/colaborador-valores/${encodeURIComponent(campo)}`),
    reporteRotacion: (token, params) => get(token, '/reportes/rotacion', params),
    reporteGraficas: (token, params) => get(token, '/reportes/graficas', params),
    health: (token) => get(token, '/health'),
    listFichaNovedades: (token, params) => get(token, '/ficha-novedades', params),
    getFichaNovedad: (token, id) => get(token, `/ficha-novedades/${encodeURIComponent(id)}`),
    aprobarFichaNovedad: (token, id, body) =>
        post(token, `/ficha-novedades/${encodeURIComponent(id)}/aprobar`, body || {}),
    rechazarFichaNovedad: (token, id, body) => post(token, `/ficha-novedades/${encodeURIComponent(id)}/rechazar`, body || {}),
    vincularFichaNovedad: (token, id, body) => post(token, `/ficha-novedades/${encodeURIComponent(id)}/vincular`, body || {}),
    editarFichaNovedad: (token, id, body) => patch(token, `/ficha-novedades/${encodeURIComponent(id)}`, body || {})
};

export default onboardingApi;
