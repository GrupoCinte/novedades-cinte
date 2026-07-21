'use strict';

const { mapCandidatoToZohoPayload, mapZohoRecordToCandidato } = require('./zohoRecruitMapper');

const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_RECRUIT_BASE = 'https://recruit.zoho.com/recruit/v2';

const CANDIDATE_FIELDS = [
    'Full_Name', 'Skill_Set', 'City', 'Email', 'Mobile', 'Cargo_Actual',
    'Experience_in_Years', 'id', 'Modified_On', 'Last_Activity_Time',
    'Candidate_Status', 'Description', 'Profesi_n', 'Expected_Salary', 'Aspiracion_Salarial'
].join(',');

function isZohoConfigured() {
    return Boolean(
        process.env.ZOHO_RECRUIT_CLIENT_ID
        && process.env.ZOHO_RECRUIT_CLIENT_SECRET
        && (process.env.ZOHO_RECRUIT_REFRESH_TOKEN || process.env.ZOHO_RECRUIT_ACCESS_TOKEN)
    );
}

function parseSalarioMax(criterios) {
    const rangos = criterios?.salario_rangos_cop;
    if (!Array.isArray(rangos) || !rangos.length) return null;
    for (const r of rangos) {
        const digits = String(r).replace(/\D/g, '');
        if (digits) {
            const n = Number(digits);
            if (Number.isFinite(n) && n > 0) return n;
        }
    }
    return null;
}

function excedeAspiracion(salarioTxt, salarioMax) {
    if (!salarioMax) return false;
    if (!salarioTxt || !String(salarioTxt).trim()) return true;
    const t = String(salarioTxt).toLowerCase();
    if (/convenir|confidencial|no especifica/.test(t)) return false;
    const nums = t.match(/[\d][\d.,]*/g) || [];
    const valores = [];
    for (const n of nums) {
        let limpio = n;
        if (n.split('.').length > 2 || (n.includes('.') && n.split('.').pop().length === 3)) {
            limpio = n.replace(/\./g, '').replace(',', '.');
        } else {
            limpio = n.replace(',', '.');
        }
        const val = parseFloat(limpio);
        if (Number.isFinite(val)) {
            const tieneMillon = /\bm\b|mill[oó]n|m cop/.test(t);
            valores.push(tieneMillon && val < 1000 ? val * 1_000_000 : val < 100 ? val * 1_000_000 : val);
        }
    }
    if (!valores.length) return true;
    return Math.min(...valores) > salarioMax;
}

/**
 * @param {{ getTokens: () => Promise<object|null>, saveTokens: (t: object) => Promise<void> }} tokenStore
 */
function createZohoRecruitClient(tokenStore) {
    async function refreshAccessToken(tokens) {
        const refresh = tokens?.refresh_token || process.env.ZOHO_RECRUIT_REFRESH_TOKEN;
        if (!refresh) return null;
        const params = new URLSearchParams({
            refresh_token: refresh,
            client_id: process.env.ZOHO_RECRUIT_CLIENT_ID,
            client_secret: process.env.ZOHO_RECRUIT_CLIENT_SECRET,
            grant_type: 'refresh_token'
        });
        const res = await fetch(`${ZOHO_TOKEN_URL}?${params}`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!data.access_token) return null;
        const next = {
            ...tokens,
            access_token: data.access_token,
            expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000
        };
        if (tokenStore?.saveTokens) await tokenStore.saveTokens(next);
        return next;
    }

    async function getAccessToken() {
        let tokens = tokenStore?.getTokens ? await tokenStore.getTokens() : null;
        if (!tokens?.access_token && process.env.ZOHO_RECRUIT_ACCESS_TOKEN) {
            tokens = {
                access_token: process.env.ZOHO_RECRUIT_ACCESS_TOKEN,
                refresh_token: process.env.ZOHO_RECRUIT_REFRESH_TOKEN || null
            };
        }
        if (!tokens?.access_token && process.env.ZOHO_RECRUIT_REFRESH_TOKEN) {
            tokens = await refreshAccessToken({ refresh_token: process.env.ZOHO_RECRUIT_REFRESH_TOKEN });
        }
        if (tokens?.expires_at && tokens.expires_at < Date.now() + 60000) {
            tokens = await refreshAccessToken(tokens);
        }
        return tokens?.access_token || null;
    }

    async function zohoFetch(path, { method = 'GET', params, body } = {}) {
        let token = await getAccessToken();
        if (!token) throw new Error('Zoho Recruit no conectado (falta token OAuth)');

        const url = new URL(`${ZOHO_RECRUIT_BASE}${path}`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v != null) url.searchParams.set(k, String(v));
            }
        }

        const doRequest = async (authToken) => fetch(url, {
            method,
            headers: {
                Authorization: `Zoho-oauthtoken ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });

        let res = await doRequest(token);
        if (res.status === 401 && tokenStore?.getTokens) {
            const refreshed = await refreshAccessToken(await tokenStore.getTokens());
            if (refreshed?.access_token) {
                token = refreshed.access_token;
                res = await doRequest(token);
            }
        }
        return res;
    }

    async function searchCandidates({
        cargo,
        ciudad = '',
        maxC = 30,
        skills = [],
        experienciaMin = 0,
        salarioMax = null
    }) {
        const candidatos = [];
        const estados = [
            null,
            'Submitted-to-client', 'Ha sido seleccionado otro Candidato',
            'Rechazado por CV', 'Rechazado por entrevista',
            'Vacante Cancelada por Cliente', 'Declina del Proceso'
        ];

        const searchBySkills = skills.length > 0;
        const skillParts = skills.slice(0, 3).map((s) => `(Skill_Set:contains:${s})`);
        const skillCriteria = skillParts.length ? skillParts.join('OR') : null;

        async function procesarRec(rec) {
            const mapped = mapZohoRecordToCandidato(rec, cargo);
            if (!mapped.nombre) return;
            if (ciudad && mapped.ciudad && !mapped.ciudad.toLowerCase().includes(ciudad.toLowerCase())) return;
            if (experienciaMin) {
                const exp = parseFloat(mapped.experiencia);
                if (Number.isFinite(exp) && exp < experienciaMin) return;
            }
            if (excedeAspiracion(mapped.salario, salarioMax)) return;
            if (candidatos.some((c) => c.nombre === mapped.nombre)) return;
            candidatos.push(mapped);
        }

        if (searchBySkills && skillCriteria) {
            for (const estado of estados) {
                if (candidatos.length >= maxC) break;
                const criteria = estado
                    ? `(${skillCriteria})AND(Candidate_Status:equals:${estado})`
                    : skillCriteria;
                for (let page = 1; page <= 3 && candidatos.length < maxC; page += 1) {
                    const res = await zohoFetch('/Candidates/search', {
                        params: { per_page: 200, page, criteria, fields: CANDIDATE_FIELDS }
                    });
                    if (!res.ok) break;
                    const data = await res.json().catch(() => ({}));
                    for (const rec of data.data || []) {
                        if (candidatos.length >= maxC) break;
                        await procesarRec(rec);
                    }
                    if (!data.info?.more_records) break;
                }
            }
        } else {
            for (let page = 1; page <= 20 && candidatos.length < maxC; page += 1) {
                const res = await zohoFetch('/Candidates', {
                    params: { per_page: 200, page, fields: CANDIDATE_FIELDS }
                });
                if (!res.ok) break;
                const data = await res.json().catch(() => ({}));
                for (const rec of data.data || []) {
                    if (candidatos.length >= maxC) break;
                    await procesarRec(rec);
                }
                if (!data.info?.more_records) break;
            }
        }

        return candidatos;
    }

    async function rediscoveryCandidates({ cargo, skills = [], maxC = 50 }) {
        const candidatos = [];
        const ahora = Date.now();
        for (let page = 1; page <= 10 && candidatos.length < maxC; page += 1) {
            const res = await zohoFetch('/Candidates', {
                params: {
                    per_page: 200,
                    page,
                    fields: 'Full_Name,Skill_Set,City,Email,Mobile,Cargo_Actual,Experience_in_Years,id,Modified_On'
                }
            });
            if (!res.ok) break;
            const data = await res.json().catch(() => ({}));
            for (const rec of data.data || []) {
                const modTime = rec.Modified_On || '';
                if (!modTime) continue;
                const fechaMod = new Date(String(modTime).slice(0, 19));
                if (Number.isNaN(fechaMod.getTime())) continue;
                const dias = Math.floor((ahora - fechaMod.getTime()) / 86400000);
                if (dias < 30 || dias > 180) continue;
                if (skills.length) {
                    const texto = `${rec.Skill_Set || ''} ${rec.Cargo_Actual || ''}`.toLowerCase();
                    if (!skills.some((s) => texto.includes(String(s).toLowerCase()))) continue;
                }
                const mapped = mapZohoRecordToCandidato(rec, cargo);
                mapped.dias_inactivo = String(dias);
                mapped.fuente = 'Zoho Rediscovery';
                candidatos.push(mapped);
                if (candidatos.length >= maxC) break;
            }
            if (!data.info?.more_records) break;
        }
        return candidatos;
    }

    async function createCandidate(candidato) {
        const payload = mapCandidatoToZohoPayload(candidato);
        const res = await zohoFetch('/Candidates', { method: 'POST', body: payload });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            throw new Error(`Zoho create failed: ${res.status} ${err.slice(0, 200)}`);
        }
        return res.json().catch(() => ({}));
    }

    return {
        isZohoConfigured,
        getAccessToken,
        searchCandidates,
        rediscoveryCandidates,
        createCandidate,
        parseSalarioMax,
        excedeAspiracion
    };
}

module.exports = {
    createZohoRecruitClient,
    isZohoConfigured,
    parseSalarioMax,
    excedeAspiracion
};
