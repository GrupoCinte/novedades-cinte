/**
 * Acceso a datos del módulo Atracción de Talento.
 */

const { isValidFase } = require('./sourcingPipeline');
const { buildDefaultPlantillas } = require('./services/plantillasDefault');

const JOB_SELECT =
    'id, vacante_id, codigo, estado, fase, fuentes, progreso, error_mensaje, tipo, meta, created_at, updated_at';
const CANDIDATO_SELECT =
    'id, job_id, vacante_id, fuente, url_perfil, nombre, perfil, resumee_id, etapa, enriquecido, score, resumen_score, decision, created_at, updated_at';

function parseUuidActor(sub) {
    const s = String(sub || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return s;
    return null;
}

const FUENTE_PROGRESS_MAP = {
    'el empleo': 'elempleo',
    elempleo: 'elempleo',
    linkedin: 'linkedin',
    'linkedin recruiter': 'linkedin',
    xray: 'xray',
    'x-ray': 'xray',
    zoho: 'zoho',
    'zoho recruit': 'zoho',
    'zoho rediscovery': 'zoho',
    postulaciones: 'postulaciones',
    'el empleo postulaciones': 'postulaciones'
};

function normalizeFuenteProgressKey(fuente) {
    const key = String(fuente || '').trim().toLowerCase();
    return FUENTE_PROGRESS_MAP[key] || null;
}

function createSourcingStore({ pool }) {
    if (!pool) throw new Error('createSourcingStore: falta pool');

    async function listVacantes({ limit = 50, incluirArchivadas = false, q: search = '' } = {}) {
        const conditions = [];
        const params = [];
        if (!incluirArchivadas) {
            conditions.push(`estado <> 'archivada'`);
        }
        const term = String(search || '').trim();
        if (term) {
            // Permite buscar por texto (título/descripción) o por código: acepta
            // "123", "VAC-000123", etc. quedándose con los dígitos.
            const digits = term.replace(/\D/g, '');
            params.push(`%${term}%`);
            const likeIdx = params.length;
            if (digits) {
                params.push(Number(digits));
                const codeIdx = params.length;
                conditions.push(`(titulo ILIKE $${likeIdx} OR descripcion ILIKE $${likeIdx} OR codigo = $${codeIdx})`);
            } else {
                conditions.push(`(titulo ILIKE $${likeIdx} OR descripcion ILIKE $${likeIdx})`);
            }
        }
        params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(
            `SELECT id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at
             FROM sourcing_vacantes
             ${where}
             ORDER BY created_at DESC
             LIMIT $${params.length}`,
            params
        );
        return result.rows || [];
    }

    async function archiveVacante(id) {
        const q = await pool.query(
            `UPDATE sourcing_vacantes
             SET estado = 'archivada', updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at`,
            [id]
        );
        return q.rows[0] || null;
    }

    async function updateVacantePostulacionesUrl({ id, url }) {
        const normalized = String(url || '').trim() || null;
        const q = await pool.query(
            `UPDATE sourcing_vacantes
             SET url_postulaciones_ee = $2, updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at`,
            [id, normalized]
        );
        return q.rows[0] || null;
    }

    async function updateVacanteTextoOferta({ id, textoOferta }) {
        const normalized = String(textoOferta || '').trim() || null;
        const q = await pool.query(
            `UPDATE sourcing_vacantes
             SET texto_oferta = $2, updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at`,
            [id, normalized]
        );
        return q.rows[0] || null;
    }

    async function createVacante({ titulo, descripcion, criterios, estado, actorUserId }) {
        const nextEstado = estado || 'borrador';
        const q = await pool.query(
            `INSERT INTO sourcing_vacantes (titulo, descripcion, criterios, estado, created_by)
             VALUES ($1, $2, $3::jsonb, $4, $5::uuid)
             RETURNING id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at`,
            [
                titulo || null,
                descripcion,
                JSON.stringify(criterios || {}),
                nextEstado,
                parseUuidActor(actorUserId)
            ]
        );
        return q.rows[0];
    }

    async function updateVacanteParsed({ id, titulo, criterios, estado }) {
        const q = await pool.query(
            `UPDATE sourcing_vacantes
             SET titulo = COALESCE($2, titulo),
                 criterios = $3::jsonb,
                 estado = $4,
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at`,
            [id, titulo || null, JSON.stringify(criterios || {}), estado]
        );
        return q.rows[0] || null;
    }

    async function updateVacanteCriterios({ id, criterios, confirmar }) {
        const current = await getVacanteById(id);
        if (!current) return null;
        const merged = { ...(current.criterios || {}), ...(criterios || {}) };
        if (confirmar) {
            merged.filtros_confirmados = true;
            merged.filtros_confirmados_at = new Date().toISOString();
        }
        const estado = confirmar ? 'activa' : current.estado || 'borrador';
        return updateVacanteParsed({
            id,
            titulo: current.titulo,
            criterios: merged,
            estado
        });
    }

    async function getVacanteById(id) {
        const q = await pool.query(
            `SELECT id, codigo, titulo, descripcion, criterios, estado, url_postulaciones_ee, texto_oferta, created_at, updated_at
             FROM sourcing_vacantes WHERE id = $1::uuid`,
            [id]
        );
        return q.rows[0] || null;
    }

    async function listJobsByVacante(vacanteId, { limit = 20 } = {}) {
        const q = await pool.query(
            `SELECT ${JOB_SELECT}
             FROM sourcing_jobs
             WHERE vacante_id = $1::uuid
             ORDER BY created_at DESC
             LIMIT $2`,
            [vacanteId, Math.min(Math.max(Number(limit) || 20, 1), 100)]
        );
        return q.rows || [];
    }

    async function createJob({ vacanteId, fuentes, actorUserId, tipo = 'busqueda', meta = {} }) {
        const q = await pool.query(
            `INSERT INTO sourcing_jobs (vacante_id, codigo, estado, fase, fuentes, progreso, tipo, meta, created_by)
             VALUES (
                 $1::uuid,
                 (SELECT COALESCE(MAX(codigo), 0) + 1 FROM sourcing_jobs WHERE vacante_id = $1::uuid),
                 'pendiente', 'descubrimiento', $2::jsonb, '{}'::jsonb, $4, $5::jsonb, $3::uuid
             )
             RETURNING ${JOB_SELECT}, tipo, meta`,
            [vacanteId, JSON.stringify(fuentes || {}), parseUuidActor(actorUserId), tipo, JSON.stringify(meta || {})]
        );
        return q.rows[0];
    }

    async function finalizeJobProgress(progreso, jobEstado) {
        const next = { ...(progreso || {}) };
        const resolved = jobEstado === 'fallido' ? 'fallido' : 'completado';
        for (const key of Object.keys(next)) {
            if (key === 'fases') continue;
            const p = next[key];
            if (p && typeof p === 'object' && (p.estado === 'en_progreso' || p.estado === 'pendiente')) {
                next[key] = { ...p, estado: resolved };
            }
        }
        if (next.fases && typeof next.fases === 'object') {
            const fases = { ...next.fases };
            for (const fk of Object.keys(fases)) {
                const fv = fases[fk];
                if (fv && typeof fv === 'object' && (fv.estado === 'en_progreso' || fv.estado === 'pendiente')) {
                    fases[fk] = { ...fv, estado: resolved };
                }
            }
            next.fases = fases;
        }
        return next;
    }

    async function updateJobState({ jobId, estado, errorMensaje, fase }) {
        const current = await getJobByIdRaw(jobId);
        if (!current) return null;

        const terminal = ['completado', 'parcial', 'fallido', 'cancelado'].includes(estado);
        const progreso = terminal
            ? await finalizeJobProgress(current.progreso, estado)
            : (current.progreso || {});

        const q = await pool.query(
            `UPDATE sourcing_jobs
             SET estado = $2,
                 error_mensaje = $3,
                 fase = COALESCE($4, fase),
                 progreso = $5::jsonb,
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING ${JOB_SELECT}`,
            [jobId, estado, errorMensaje || null, fase || null, JSON.stringify(progreso)]
        );
        return q.rows[0] || null;
    }

    async function updateJobPhase({ jobId, fase, patch }) {
        if (!isValidFase(fase)) return null;
        const current = await getJobByIdRaw(jobId);
        if (!current) return null;
        const progreso = { ...(current.progreso || {}) };
        const fases = { ...(progreso.fases || {}) };
        fases[fase] = {
            ...(fases[fase] || {}),
            ...(patch || {}),
            updated_at: new Date().toISOString()
        };
        progreso.fases = fases;
        const nextEstado = patch?.estado === 'en_progreso' ? 'en_progreso' : current.estado;
        const q = await pool.query(
            `UPDATE sourcing_jobs
             SET progreso = $2::jsonb,
                 fase = $3,
                 estado = CASE WHEN estado = 'pendiente' THEN 'en_progreso' ELSE $4 END,
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING ${JOB_SELECT}`,
            [jobId, JSON.stringify(progreso), fase, nextEstado]
        );
        return q.rows[0] || null;
    }

    async function updateJobProgress({ jobId, fuente, patch }) {
        const current = await getJobByIdRaw(jobId);
        if (!current) return null;
        const progreso = { ...(current.progreso || {}) };
        progreso[fuente] = { ...(progreso[fuente] || {}), ...(patch || {}) };
        const q = await pool.query(
            `UPDATE sourcing_jobs
             SET progreso = $2::jsonb,
                 estado = CASE WHEN estado = 'pendiente' THEN 'en_progreso' ELSE estado END,
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING ${JOB_SELECT}`,
            [jobId, JSON.stringify(progreso)]
        );
        return q.rows[0] || null;
    }

    async function upsertCandidato({
        jobId,
        vacanteId,
        fuente,
        urlPerfil,
        nombre,
        perfil,
        etapa,
        enriquecido,
        resumeeId
    }) {
        const nextEtapa = etapa || 'descubrimiento';
        const nextEnriquecido = Boolean(enriquecido);
        const perfilObj = perfil && typeof perfil === 'object' ? perfil : {};
        const rid = String(resumeeId || perfilObj.resumee_id || '').trim() || null;

        if (rid) {
            const existing = await pool.query(
                `SELECT id FROM sourcing_candidatos
                 WHERE vacante_id = $1::uuid AND fuente = $2 AND resumee_id = $3
                 LIMIT 1`,
                [vacanteId, fuente, rid]
            );
            if (existing.rows[0]?.id) {
                const q = await pool.query(
                    `UPDATE sourcing_candidatos
                     SET job_id = $1::uuid,
                         perfil = sourcing_candidatos.perfil || $2::jsonb,
                         nombre = COALESCE($3, nombre),
                         url_perfil = COALESCE($4, url_perfil),
                         etapa = $5,
                         enriquecido = enriquecido OR $6,
                         updated_at = NOW()
                     WHERE id = $7::uuid
                     RETURNING ${CANDIDATO_SELECT}`,
                    [
                        jobId,
                        JSON.stringify(perfilObj),
                        nombre || null,
                        urlPerfil || null,
                        nextEtapa,
                        nextEnriquecido,
                        existing.rows[0].id
                    ]
                );
                return q.rows[0];
            }
        }

        const q = await pool.query(
            `INSERT INTO sourcing_candidatos (job_id, vacante_id, fuente, url_perfil, nombre, perfil, resumee_id, etapa, enriquecido)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9)
             ON CONFLICT (job_id, fuente, COALESCE(url_perfil, ''), COALESCE(nombre, ''))
             DO UPDATE SET
                perfil = sourcing_candidatos.perfil || EXCLUDED.perfil,
                nombre = COALESCE(EXCLUDED.nombre, sourcing_candidatos.nombre),
                resumee_id = COALESCE(EXCLUDED.resumee_id, sourcing_candidatos.resumee_id),
                etapa = EXCLUDED.etapa,
                enriquecido = EXCLUDED.enriquecido OR sourcing_candidatos.enriquecido,
                updated_at = NOW()
             RETURNING ${CANDIDATO_SELECT}`,
            [
                jobId,
                vacanteId,
                fuente,
                urlPerfil || null,
                nombre || null,
                JSON.stringify(perfilObj),
                rid,
                nextEtapa,
                nextEnriquecido
            ]
        );
        return q.rows[0];
    }

    async function listCandidatosByVacante(vacanteId, { limit = 200 } = {}) {
        const q = await pool.query(
            `SELECT ${CANDIDATO_SELECT}
             FROM sourcing_candidatos
             WHERE vacante_id = $1::uuid
             ORDER BY score DESC NULLS LAST, created_at DESC
             LIMIT $2`,
            [vacanteId, Math.min(Math.max(Number(limit) || 200, 1), 500)]
        );
        return q.rows || [];
    }

    const STALE_PENDING_MS = 2 * 60 * 1000;
    const STALE_ACTIVE_MS = 5 * 60 * 1000;

    function isStaleActiveJob(job) {
        if (!job || (job.estado !== 'pendiente' && job.estado !== 'en_progreso')) return false;

        const progreso = job.progreso && typeof job.progreso === 'object' ? job.progreso : {};
        const fuenteKeys = Object.keys(progreso).filter((k) => k !== 'fases');
        const faseKeys = progreso.fases && typeof progreso.fases === 'object'
            ? Object.keys(progreso.fases)
            : [];
        const hasProgress = fuenteKeys.length > 0 || faseKeys.length > 0;

        const created = job.created_at ? new Date(job.created_at).getTime() : 0;
        const updated = job.updated_at ? new Date(job.updated_at).getTime() : created;

        if (!hasProgress) {
            return created > 0 && Date.now() - created > STALE_PENDING_MS;
        }

        return updated > 0 && Date.now() - updated > STALE_ACTIVE_MS;
    }

    async function reconcileStaleJob(job) {
        if (!isStaleActiveJob(job)) return job;
        const msg = job.progreso && Object.keys(job.progreso).length
            ? 'Búsqueda interrumpida (el worker dejó de responder). Reinicie el worker e inicie una búsqueda nueva.'
            : 'Búsqueda interrumpida (sin respuesta del worker). Inicie una búsqueda nueva.';
        return updateJobState({
            jobId: job.id,
            estado: 'fallido',
            errorMensaje: msg
        });
    }

    async function getJobByIdRaw(id) {
        const q = await pool.query(
            `SELECT ${JOB_SELECT} FROM sourcing_jobs WHERE id = $1::uuid`,
            [id]
        );
        return q.rows[0] || null;
    }

    async function getJobById(id) {
        const job = await getJobByIdRaw(id);
        if (!job) return null;
        return reconcileStaleJob(job);
    }

    async function reconcileAllStaleJobs({ maxAgeMinutes = 2 } = {}) {
        const q = await pool.query(
            `SELECT ${JOB_SELECT}
             FROM sourcing_jobs
             WHERE estado IN ('pendiente', 'en_progreso')
               AND (progreso IS NULL OR progreso = '{}'::jsonb)
               AND created_at < NOW() - ($1::text || ' minutes')::interval`,
            [String(Math.max(Number(maxAgeMinutes) || 2, 1))]
        );
        let updated = 0;
        for (const row of q.rows || []) {
            await updateJobState({
                jobId: row.id,
                estado: 'fallido',
                errorMensaje: 'Búsqueda interrumpida (sin respuesta del worker). Inicie una búsqueda nueva.'
            });
            updated += 1;
        }
        return updated;
    }

    async function countCandidatosByJob(jobId) {
        const q = await pool.query(
            `SELECT COUNT(*)::int AS n FROM sourcing_candidatos WHERE job_id = $1::uuid`,
            [jobId]
        );
        return q.rows[0]?.n ?? 0;
    }

    async function listCandidatosByJob(jobId, { limit = 200 } = {}) {
        const q = await pool.query(
            `SELECT ${CANDIDATO_SELECT}
             FROM sourcing_candidatos
             WHERE job_id = $1::uuid
             ORDER BY score DESC NULLS LAST, created_at ASC
             LIMIT $2`,
            [jobId, Math.min(Math.max(Number(limit) || 200, 1), 500)]
        );
        return q.rows || [];
    }

    async function listRecentCandidatos({ limit = 200 } = {}) {
        const q = await pool.query(
            `SELECT c.id, c.job_id, c.vacante_id, c.fuente, c.url_perfil, c.nombre, c.perfil,
                    c.etapa, c.enriquecido, c.score, c.resumen_score, c.decision, c.created_at, c.updated_at,
                    v.titulo AS vacante_titulo, v.codigo AS vacante_codigo
             FROM sourcing_candidatos c
             JOIN sourcing_vacantes v ON v.id = c.vacante_id
             WHERE v.estado <> 'archivada'
             ORDER BY c.score DESC NULLS LAST, c.created_at DESC
             LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 200, 1), 500)]
        );
        return q.rows || [];
    }

    // Base de captura: TODOS los candidatos capturados, incluidos los de vacantes
    // archivadas. Filtrable por texto (nombre), código de vacante o fuente.
    async function listCapturaCandidatos({ q: search = '', fuente = '', limit = 300 } = {}) {
        const conditions = [];
        const params = [];
        const term = String(search || '').trim();
        if (term) {
            const digits = term.replace(/\D/g, '');
            params.push(`%${term}%`);
            const likeIdx = params.length;
            if (digits) {
                params.push(Number(digits));
                const codeIdx = params.length;
                conditions.push(
                    `(c.nombre ILIKE $${likeIdx} OR v.titulo ILIKE $${likeIdx} OR v.codigo = $${codeIdx})`
                );
            } else {
                conditions.push(`(c.nombre ILIKE $${likeIdx} OR v.titulo ILIKE $${likeIdx})`);
            }
        }
        const fuenteTerm = String(fuente || '').trim();
        if (fuenteTerm) {
            params.push(`%${fuenteTerm}%`);
            conditions.push(`c.fuente ILIKE $${params.length}`);
        }
        params.push(Math.min(Math.max(Number(limit) || 300, 1), 1000));
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(
            `SELECT c.id, c.job_id, c.vacante_id, c.fuente, c.url_perfil, c.nombre, c.perfil,
                    c.etapa, c.enriquecido, c.score, c.resumen_score, c.decision, c.created_at, c.updated_at,
                    v.titulo AS vacante_titulo, v.codigo AS vacante_codigo, v.estado AS vacante_estado
             FROM sourcing_candidatos c
             JOIN sourcing_vacantes v ON v.id = c.vacante_id
             ${where}
             ORDER BY c.score DESC NULLS LAST, c.created_at DESC
             LIMIT $${params.length}`,
            params
        );
        return result.rows || [];
    }

    async function listCandidatosByJobPendingScore(jobId) {
        const q = await pool.query(
            `SELECT ${CANDIDATO_SELECT}
             FROM sourcing_candidatos
             WHERE job_id = $1::uuid AND score IS NULL
             ORDER BY created_at ASC`,
            [jobId]
        );
        return q.rows || [];
    }

    async function getCandidatosByIds(ids) {
        const list = (Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter(Boolean);
        if (!list.length) return [];
        const q = await pool.query(
            `SELECT ${CANDIDATO_SELECT}
             FROM sourcing_candidatos
             WHERE id = ANY($1::uuid[])`,
            [list]
        );
        return q.rows || [];
    }

    // Determina canal y contacto para un candidato:
    //  - LinkedIn -> inmail (contacto = url_perfil)
    //  - con teléfono -> whatsapp (contacto = teléfono)
    //  - resto -> inmail si hay url, si no whatsapp sin contacto (queda pendiente)
    function resolveCanalContacto(candidato) {
        const perfil = candidato?.perfil && typeof candidato.perfil === 'object' ? candidato.perfil : {};
        const fuente = String(candidato?.fuente || '').toLowerCase();
        const telefono =
            (typeof perfil.telefono === 'string' && perfil.telefono.trim())
            || (Array.isArray(perfil.contactos)
                ? (perfil.contactos.map((c) => c && c.telefono).find((t) => typeof t === 'string' && t.trim()) || '')
                : '');
        const url = typeof candidato?.url_perfil === 'string' ? candidato.url_perfil : '';

        if (fuente.includes('linkedin')) {
            return { canal: 'inmail', contacto: url || null };
        }
        if (telefono) {
            return { canal: 'whatsapp', contacto: telefono.trim() };
        }
        if (url) {
            return { canal: 'inmail', contacto: url };
        }
        return { canal: 'whatsapp', contacto: null };
    }

    // Inserta un destinatario resolviendo canal/contacto; evita duplicar candidatos ya presentes.
    async function insertDestinatario(campanaId, cand, canalDefault, mensajePlantilla) {
        const dup = await pool.query(
            `SELECT id FROM sourcing_campana_destinatarios
             WHERE campana_id = $1::uuid AND candidato_id = $2::uuid`,
            [campanaId, cand.id]
        );
        if (dup.rows.length) return null;

        let canal;
        const resolved = resolveCanalContacto(cand);
        if (canalDefault && canalDefault !== 'auto') canal = canalDefault;
        else canal = resolved.canal;
        const contacto = resolved.contacto;

        const ins = await pool.query(
            `INSERT INTO sourcing_campana_destinatarios
                (campana_id, candidato_id, nombre, canal, contacto, mensaje)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
             RETURNING id, campana_id, candidato_id, nombre, canal, contacto, correo, mensaje, estado, error_mensaje, enviado_at, created_at, updated_at`,
            [campanaId, cand.id, cand.nombre || null, canal, contacto, mensajePlantilla || null]
        );
        return ins.rows[0];
    }

    // Alta manual de un destinatario (sin candidato asociado): nombre + teléfono y/o correo.
    async function insertManualDestinatario(campanaId, { nombre, telefono, correo }, mensajePlantilla) {
        const digits = String(telefono || '').replace(/\D/g, '');
        const canal = digits ? 'whatsapp' : 'inmail';
        const contacto = digits || (correo ? String(correo).trim() : null);
        const ins = await pool.query(
            `INSERT INTO sourcing_campana_destinatarios
                (campana_id, candidato_id, nombre, canal, contacto, correo, mensaje)
             VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6)
             RETURNING id, campana_id, candidato_id, nombre, canal, contacto, correo, mensaje, estado, error_mensaje, enviado_at, created_at, updated_at`,
            [campanaId, nombre || null, canal, contacto, correo ? String(correo).trim() : null, mensajePlantilla || null]
        );
        return ins.rows[0];
    }

    async function createCampana({ nombre, mensajePlantilla, canalDefault, candidatoIds, plantillas, vacanteId, actorUserId }) {
        // Regla de negocio: a una campaña solo pasan candidatos APROBADOS.
        const candidatos = (await getCandidatosByIds(candidatoIds))
            .filter((c) => c.decision === 'aprobado');
        // Sin candidatos elegibles no creamos cabecera (evita campañas huérfanas).
        if (candidatos.length === 0) {
            return { destinatarios: [] };
        }

        const vacanteIds = [...new Set(candidatos.map((c) => c.vacante_id).filter(Boolean))];
        let vacanteIdFinal = vacanteId || null;
        if (!vacanteIdFinal && vacanteIds.length === 1) vacanteIdFinal = vacanteIds[0];

        const plantillasFinal = (plantillas && typeof plantillas === 'object' && Object.keys(plantillas).length)
            ? plantillas
            : buildDefaultPlantillas();

        const cabecera = await pool.query(
            `INSERT INTO sourcing_campanas (nombre, canal_default, mensaje_plantilla, plantillas, vacante_id, created_by)
             VALUES ($1, $2, $3, $4::jsonb, $5::uuid, $6::uuid)
             RETURNING id, nombre, canal_default, mensaje_plantilla, plantillas, vacante_id, estado, created_at, updated_at`,
            [nombre, canalDefault || 'auto', mensajePlantilla || null, JSON.stringify(plantillasFinal), vacanteIdFinal, parseUuidActor(actorUserId)]
        );
        const campana = cabecera.rows[0];

        const destinatarios = [];
        for (const cand of candidatos) {
            const row = await insertDestinatario(campana.id, cand, canalDefault, mensajePlantilla);
            if (row) destinatarios.push(row);
        }
        return { ...campana, destinatarios };
    }

    async function addDestinatarios({ campanaId, candidatoIds, manuales }) {
        const cab = await pool.query(
            `SELECT id, canal_default, mensaje_plantilla FROM sourcing_campanas WHERE id = $1::uuid`,
            [campanaId]
        );
        const campana = cab.rows[0];
        if (!campana) return null;

        const agregados = [];
        if (Array.isArray(candidatoIds) && candidatoIds.length) {
            const candidatos = (await getCandidatosByIds(candidatoIds))
                .filter((c) => c.decision === 'aprobado');
            for (const cand of candidatos) {
                const row = await insertDestinatario(campanaId, cand, campana.canal_default, campana.mensaje_plantilla);
                if (row) agregados.push(row);
            }
        }
        if (Array.isArray(manuales) && manuales.length) {
            for (const m of manuales) {
                if (!m || (!m.telefono && !m.correo)) continue;
                const row = await insertManualDestinatario(campanaId, m, campana.mensaje_plantilla);
                if (row) agregados.push(row);
            }
        }
        return { agregados, campana: await getCampanaById(campanaId) };
    }

    async function updateCampana({ campanaId, nombre, mensajePlantilla, plantillas }) {
        const sets = [];
        const params = [campanaId];
        if (typeof nombre === 'string') { params.push(nombre); sets.push(`nombre = $${params.length}`); }
        if (mensajePlantilla !== undefined) { params.push(mensajePlantilla || null); sets.push(`mensaje_plantilla = $${params.length}`); }
        if (plantillas !== undefined) { params.push(JSON.stringify(plantillas || {})); sets.push(`plantillas = $${params.length}::jsonb`); }
        if (!sets.length) return getCampanaById(campanaId);
        await pool.query(
            `UPDATE sourcing_campanas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1::uuid`,
            params
        );
        return getCampanaById(campanaId);
    }

    async function listCampanas({ limit = 50 } = {}) {
        const q = await pool.query(
            `SELECT c.id, c.nombre, c.canal_default, c.mensaje_plantilla, c.estado, c.created_at, c.updated_at,
                    COUNT(d.id)::int AS total_destinatarios,
                    COUNT(d.id) FILTER (WHERE d.estado = 'enviado')::int AS enviados
             FROM sourcing_campanas c
             LEFT JOIN sourcing_campana_destinatarios d ON d.campana_id = c.id
             GROUP BY c.id
             ORDER BY c.created_at DESC
             LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 50, 1), 200)]
        );
        return q.rows || [];
    }

    async function getCampanaById(id) {
        const cab = await pool.query(
            `SELECT id, nombre, canal_default, mensaje_plantilla, plantillas, vacante_id, estado, created_at, updated_at
             FROM sourcing_campanas WHERE id = $1::uuid`,
            [id]
        );
        const campana = cab.rows[0];
        if (!campana) return null;
        const dest = await pool.query(
            `SELECT id, campana_id, candidato_id, nombre, canal, contacto, correo, mensaje, estado, error_mensaje, enviado_at, created_at, updated_at
             FROM sourcing_campana_destinatarios
             WHERE campana_id = $1::uuid
             ORDER BY created_at ASC`,
            [id]
        );
        return { ...campana, destinatarios: dest.rows || [] };
    }

    async function updateDestinatarioEstado({ campanaId, destinatarioId, estado, errorMensaje }) {
        const q = await pool.query(
            `UPDATE sourcing_campana_destinatarios
             SET estado = $3,
                 error_mensaje = $4,
                 enviado_at = CASE WHEN $3 = 'enviado' THEN NOW() ELSE enviado_at END,
                 updated_at = NOW()
             WHERE id = $2::uuid AND campana_id = $1::uuid
             RETURNING id, campana_id, candidato_id, nombre, canal, contacto, correo, mensaje, estado, error_mensaje, enviado_at, created_at, updated_at`,
            [campanaId, destinatarioId, estado, errorMensaje || null]
        );
        return q.rows[0] || null;
    }

    async function deleteDestinatario(campanaId, destinatarioId) {
        const q = await pool.query(
            `DELETE FROM sourcing_campana_destinatarios
             WHERE id = $2::uuid AND campana_id = $1::uuid
             RETURNING id`,
            [campanaId, destinatarioId]
        );
        return q.rows[0] || null;
    }

    async function refreshCampanaEstado(campanaId) {
        const stats = await pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE estado = 'enviado')::int AS enviados,
                    COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes
             FROM sourcing_campana_destinatarios WHERE campana_id = $1::uuid`,
            [campanaId]
        );
        const { total, enviados, pendientes } = stats.rows[0] || { total: 0, enviados: 0, pendientes: 0 };
        let estado = 'borrador';
        if (total > 0 && enviados === total) estado = 'enviada';
        else if (enviados > 0) estado = 'parcial';
        const q = await pool.query(
            `UPDATE sourcing_campanas SET estado = $2, updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, nombre, canal_default, mensaje_plantilla, estado, created_at, updated_at`,
            [campanaId, estado]
        );
        return { campana: q.rows[0] || null, total, enviados, pendientes };
    }

    async function setCampanaEstado(campanaId, estado) {
        const q = await pool.query(
            `UPDATE sourcing_campanas SET estado = $2, updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, nombre, canal_default, mensaje_plantilla, estado, created_at, updated_at`,
            [campanaId, estado]
        );
        return q.rows[0] || null;
    }

    async function deleteCandidato(id) {
        const q = await pool.query(
            `DELETE FROM sourcing_candidatos WHERE id = $1::uuid RETURNING id`,
            [id]
        );
        return q.rows[0] || null;
    }

    async function updateCandidatoDecision(id, decision) {
        const q = await pool.query(
            `UPDATE sourcing_candidatos
             SET decision = $2, updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, decision`,
            [id, decision]
        );
        return q.rows[0] || null;
    }

    async function updateCandidatoScore({ candidatoId, score, resumenScore }) {
        const q = await pool.query(
            `UPDATE sourcing_candidatos
             SET score = $2,
                 resumen_score = $3,
                 etapa = 'completo',
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING ${CANDIDATO_SELECT}`,
            [candidatoId, score, resumenScore || null]
        );
        return q.rows[0] || null;
    }

    // Contexto de vacante para destinatarios manuales (hereda la vacante de la campaña).
    async function resolveCampanaVacanteContext(campanaId) {
        const cab = await pool.query(
            `SELECT id, nombre, vacante_id FROM sourcing_campanas WHERE id = $1::uuid`,
            [campanaId]
        );
        const camp = cab.rows[0];
        if (!camp) return null;

        async function fromVacanteId(vid) {
            if (!vid) return null;
            const v = await getVacanteById(vid);
            if (!v) return null;
            return {
                vacante_id: v.id,
                vacante_titulo: v.titulo,
                vacante_codigo: v.codigo,
                criterios: (v.criterios && typeof v.criterios === 'object') ? v.criterios : {}
            };
        }

        if (camp.vacante_id) {
            const ctx = await fromVacanteId(camp.vacante_id);
            if (ctx) return ctx;
        }

        const infer = await pool.query(
            `SELECT DISTINCT c.vacante_id
             FROM sourcing_campana_destinatarios d
             JOIN sourcing_candidatos c ON c.id = d.candidato_id
             WHERE d.campana_id = $1::uuid AND c.vacante_id IS NOT NULL
             LIMIT 1`,
            [campanaId]
        );
        const inferredId = infer.rows[0]?.vacante_id;
        if (inferredId) {
            const ctx = await fromVacanteId(inferredId);
            if (ctx) {
                await pool.query(
                    `UPDATE sourcing_campanas SET vacante_id = $2::uuid, updated_at = NOW()
                     WHERE id = $1::uuid AND vacante_id IS NULL`,
                    [campanaId, inferredId]
                );
                return ctx;
            }
        }

        return {
            vacante_id: null,
            vacante_titulo: camp.nombre,
            vacante_codigo: null,
            criterios: {}
        };
    }

    // --- Contexto y preentrevista (agente Contacto AT) ---

    // Devuelve el candidato + criterios/título de su vacante (base de conocimiento).
    async function getCandidatoContext(candidatoId) {
        const q = await pool.query(
            `SELECT c.id, c.job_id, c.vacante_id, c.fuente, c.url_perfil, c.nombre, c.perfil,
                    c.score, c.resumen_score, c.decision,
                    v.titulo AS vacante_titulo, v.codigo AS vacante_codigo, v.criterios AS vacante_criterios
             FROM sourcing_candidatos c
             JOIN sourcing_vacantes v ON v.id = c.vacante_id
             WHERE c.id = $1::uuid`,
            [candidatoId]
        );
        return q.rows[0] || null;
    }

    const PREENTREVISTA_SELECT =
        'id, destinatario_id, campana_id, candidato_id, telefono, fase, estado, interes, datos, cv_url, entrevista, base_conocimiento, analista, score, resumen_match, created_at, updated_at';

    async function createPreentrevista({ destinatarioId, campanaId, candidatoId, telefono, fase, baseConocimiento, analista }) {
        if (destinatarioId) {
            const existing = await pool.query(
                `SELECT ${PREENTREVISTA_SELECT} FROM sourcing_preentrevistas WHERE destinatario_id = $1::uuid`,
                [destinatarioId]
            );
            if (existing.rows[0]) {
                if (baseConocimiento || analista) {
                    await pool.query(
                        `UPDATE sourcing_preentrevistas
                         SET base_conocimiento = COALESCE($2::jsonb, base_conocimiento),
                             analista = COALESCE($3, analista),
                             telefono = COALESCE($4, telefono),
                             updated_at = NOW()
                         WHERE id = $1::uuid`,
                        [
                            existing.rows[0].id,
                            baseConocimiento ? JSON.stringify(baseConocimiento) : null,
                            analista || null,
                            telefono || null
                        ]
                    );
                    return getPreentrevistaById(existing.rows[0].id);
                }
                return existing.rows[0];
            }
        }
        const q = await pool.query(
            `INSERT INTO sourcing_preentrevistas (destinatario_id, campana_id, candidato_id, telefono, fase, base_conocimiento, analista)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, COALESCE($5, 'apertura'), $6::jsonb, $7)
             RETURNING ${PREENTREVISTA_SELECT}`,
            [
                destinatarioId || null,
                campanaId || null,
                candidatoId || null,
                telefono || null,
                fase || null,
                baseConocimiento ? JSON.stringify(baseConocimiento) : null,
                analista || null
            ]
        );
        return q.rows[0];
    }

    async function getPreentrevistaById(id) {
        const q = await pool.query(
            `SELECT ${PREENTREVISTA_SELECT} FROM sourcing_preentrevistas WHERE id = $1::uuid`,
            [id]
        );
        return q.rows[0] || null;
    }

    async function getPreentrevistaByTelefono(telefono) {
        const digits = String(telefono || '').replace(/\D/g, '');
        if (!digits) return null;
        const q = await pool.query(
            `SELECT ${PREENTREVISTA_SELECT} FROM sourcing_preentrevistas
             WHERE regexp_replace(COALESCE(telefono,''), '\\D', '', 'g') = $1
             ORDER BY (estado = 'en_curso') DESC, updated_at DESC
             LIMIT 1`,
            [digits]
        );
        return q.rows[0] || null;
    }

    async function updatePreentrevista({ id, fase, estado, interes, datos, cvUrl, entrevista, score, resumenMatch }) {
        const current = await getPreentrevistaById(id);
        if (!current) return null;
        const sets = [];
        const params = [id];
        if (fase !== undefined) { params.push(fase); sets.push(`fase = $${params.length}`); }
        if (estado !== undefined) { params.push(estado); sets.push(`estado = $${params.length}`); }
        if (interes !== undefined) { params.push(interes || null); sets.push(`interes = $${params.length}`); }
        if (datos !== undefined) {
            const merged = { ...(current.datos || {}), ...(datos || {}) };
            params.push(JSON.stringify(merged)); sets.push(`datos = $${params.length}::jsonb`);
        }
        if (cvUrl !== undefined) { params.push(cvUrl || null); sets.push(`cv_url = $${params.length}`); }
        if (entrevista !== undefined) { params.push(entrevista ? JSON.stringify(entrevista) : null); sets.push(`entrevista = $${params.length}::jsonb`); }
        if (score !== undefined) {
            const n = Number(score);
            params.push(Number.isFinite(n) ? Math.round(n) : null);
            sets.push(`score = $${params.length}`);
        }
        if (resumenMatch !== undefined) { params.push(resumenMatch || null); sets.push(`resumen_match = $${params.length}`); }
        if (!sets.length) return current;
        const q = await pool.query(
            `UPDATE sourcing_preentrevistas SET ${sets.join(', ')}, updated_at = NOW()
             WHERE id = $1::uuid RETURNING ${PREENTREVISTA_SELECT}`,
            params
        );
        return q.rows[0] || null;
    }

    async function appendPreentrevistaMensaje({ preentrevistaId, rol, texto }) {
        const q = await pool.query(
            `INSERT INTO sourcing_preentrevista_mensajes (preentrevista_id, rol, texto)
             VALUES ($1::uuid, $2, $3)
             RETURNING id, preentrevista_id, rol, texto, created_at`,
            [preentrevistaId, rol, String(texto || '').slice(0, 8000)]
        );
        return q.rows[0];
    }

    async function getPreentrevistaMensajes(preentrevistaId, { limit = 200 } = {}) {
        const q = await pool.query(
            `SELECT id, rol, texto, created_at FROM sourcing_preentrevista_mensajes
             WHERE preentrevista_id = $1::uuid ORDER BY created_at ASC LIMIT $2`,
            [preentrevistaId, Math.min(Math.max(Number(limit) || 200, 1), 1000)]
        );
        return q.rows || [];
    }

    // Preentrevistas de una vacante (vía campañas ligadas a la vacante).
    async function listPreentrevistasByVacante(vacanteId) {
        const q = await pool.query(
            `SELECT p.id, p.destinatario_id, p.campana_id, p.candidato_id, p.telefono,
                    p.fase, p.estado, p.interes, p.datos, p.cv_url, p.entrevista,
                    p.score, p.resumen_match, p.analista, p.created_at, p.updated_at,
                    d.nombre AS destinatario_nombre, c.nombre AS campana_nombre,
                    cand.nombre AS candidato_nombre
             FROM sourcing_preentrevistas p
             JOIN sourcing_campanas c ON c.id = p.campana_id
             LEFT JOIN sourcing_campana_destinatarios d ON d.id = p.destinatario_id
             LEFT JOIN sourcing_candidatos cand ON cand.id = p.candidato_id
             WHERE c.vacante_id = $1::uuid
             ORDER BY p.updated_at DESC`,
            [vacanteId]
        );
        return q.rows || [];
    }

    // Conteos agregados por vacante para las tarjetas de Shortlist.
    // total = candidatos capturados; contactados = destinatarios con preentrevista;
    // respondieron = preentrevistas con al menos un mensaje del candidato o estado avanzado;
    // aptos = preentrevistas completadas con score >= min.
    async function listVacanteStats({ scoreMin = 70 } = {}) {
        const q = await pool.query(
            `WITH cand AS (
                SELECT vacante_id, COUNT(*)::int AS total
                FROM sourcing_candidatos
                GROUP BY vacante_id
            ), pre AS (
                SELECT c.vacante_id,
                       COUNT(*)::int AS contactados,
                       COUNT(*) FILTER (
                           WHERE p.estado IN ('interesado','completada','no_disponible','descartada')
                              OR EXISTS (
                                  SELECT 1 FROM sourcing_preentrevista_mensajes m
                                  WHERE m.preentrevista_id = p.id AND m.rol = 'candidato'
                              )
                       )::int AS respondieron,
                       COUNT(*) FILTER (
                           WHERE p.estado = 'completada' AND COALESCE(p.score, 0) >= $1
                       )::int AS aptos
                FROM sourcing_preentrevistas p
                JOIN sourcing_campanas c ON c.id = p.campana_id
                WHERE c.vacante_id IS NOT NULL
                GROUP BY c.vacante_id
            )
            SELECT v.id AS vacante_id,
                   COALESCE(cand.total, 0) AS total,
                   COALESCE(pre.contactados, 0) AS contactados,
                   COALESCE(pre.respondieron, 0) AS respondieron,
                   COALESCE(pre.aptos, 0) AS aptos
            FROM sourcing_vacantes v
            LEFT JOIN cand ON cand.vacante_id = v.id
            LEFT JOIN pre ON pre.vacante_id = v.id
            WHERE v.estado <> 'archivada'`,
            [Math.max(Number(scoreMin) || 0, 0)]
        );
        return q.rows || [];
    }

    async function getCandidatoById(id) {
        const q = await pool.query(
            `SELECT ${CANDIDATO_SELECT} FROM sourcing_candidatos WHERE id = $1::uuid`,
            [id]
        );
        return q.rows[0] || null;
    }

    async function updateCandidatoPerfil(id, perfilPatch) {
        const q = await pool.query(
            `UPDATE sourcing_candidatos
             SET perfil = perfil || $2::jsonb,
                 enriquecido = true,
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING ${CANDIDATO_SELECT}`,
            [id, JSON.stringify(perfilPatch || {})]
        );
        return q.rows[0] || null;
    }

    async function saveDecisionEntrenamiento({
        vacanteId, urlPerfil, nombre, cargoBuscado, cargoCandidato, ciudad, fuente,
        decision, scoreIa, resumenIa, perfilSnapshot, actorUserId
    }) {
        if (!decision || !['aprobado', 'rechazado'].includes(decision)) return null;
        const q = await pool.query(
            `INSERT INTO sourcing_decisiones_entrenamiento
             (vacante_id, url_perfil, nombre, cargo_buscado, cargo_candidato, ciudad, fuente,
              decision, score_ia, resumen_ia, perfil_snapshot, created_by)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid)
             RETURNING id`,
            [
                vacanteId || null,
                urlPerfil || null,
                nombre || null,
                cargoBuscado || null,
                cargoCandidato || null,
                ciudad || null,
                fuente || null,
                decision,
                scoreIa ?? null,
                resumenIa || null,
                JSON.stringify(perfilSnapshot || {}),
                parseUuidActor(actorUserId)
            ]
        );
        return q.rows[0] || null;
    }

    async function listDecisionesEntrenamiento({ cargo, limit = 5 } = {}) {
        const term = String(cargo || '').trim();
        if (!term) return [];
        const q = await pool.query(
            `SELECT nombre, cargo_candidato, ciudad, decision, score_ia, resumen_ia
             FROM sourcing_decisiones_entrenamiento
             WHERE cargo_buscado ILIKE $1 AND decision IN ('aprobado', 'rechazado')
             ORDER BY created_at DESC
             LIMIT $2`,
            [`%${term.split(/\s+/)[0]}%`, Math.min(Math.max(Number(limit) || 5, 1), 20)]
        );
        return q.rows || [];
    }

    async function createPublicacion({ vacanteId, canal, textoOferta, payload, actorUserId }) {
        const q = await pool.query(
            `INSERT INTO sourcing_publicaciones (vacante_id, canal, estado, texto_oferta, payload, created_by)
             VALUES ($1::uuid, $2, 'pendiente', $3, $4::jsonb, $5::uuid)
             RETURNING *`,
            [vacanteId, canal, textoOferta || null, JSON.stringify(payload || {}), parseUuidActor(actorUserId)]
        );
        return q.rows[0];
    }

    async function updatePublicacion({ id, estado, urlPublicada, errorMensaje }) {
        const q = await pool.query(
            `UPDATE sourcing_publicaciones
             SET estado = COALESCE($2, estado),
                 url_publicada = COALESCE($3, url_publicada),
                 error_mensaje = COALESCE($4, error_mensaje),
                 updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING *`,
            [id, estado || null, urlPublicada || null, errorMensaje || null]
        );
        return q.rows[0] || null;
    }

    async function listPublicacionesByVacante(vacanteId) {
        const q = await pool.query(
            `SELECT * FROM sourcing_publicaciones WHERE vacante_id = $1::uuid ORDER BY created_at DESC`,
            [vacanteId]
        );
        return q.rows || [];
    }

    async function createFlujo({ nombre, descripcion, pasos, actorUserId }) {
        const q = await pool.query(
            `INSERT INTO sourcing_flujos (nombre, descripcion, pasos_json, created_by)
             VALUES ($1, $2, $3::jsonb, $4::uuid)
             RETURNING *`,
            [nombre, descripcion || null, JSON.stringify(pasos || []), parseUuidActor(actorUserId)]
        );
        return q.rows[0];
    }

    async function listFlujos({ limit = 50 } = {}) {
        const q = await pool.query(
            `SELECT * FROM sourcing_flujos ORDER BY created_at DESC LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 50, 1), 100)]
        );
        return q.rows || [];
    }

    async function deleteFlujo(id) {
        await pool.query(`DELETE FROM sourcing_flujo_destinatarios WHERE flujo_id = $1::uuid`, [id]);
        const q = await pool.query(`DELETE FROM sourcing_flujos WHERE id = $1::uuid RETURNING id`, [id]);
        return q.rows[0] || null;
    }

    async function asignarFlujoCampana({ flujoId, campanaId }) {
        const candQ = await pool.query(
            `SELECT d.candidato_id, d.nombre, c.url_perfil
             FROM sourcing_campana_destinatarios d
             LEFT JOIN sourcing_candidatos c ON c.id = d.candidato_id
             WHERE d.campana_id = $1::uuid`,
            [campanaId]
        );
        let agregados = 0;
        for (const row of candQ.rows || []) {
            const dup = await pool.query(
                `SELECT id FROM sourcing_flujo_destinatarios
                 WHERE flujo_id = $1::uuid AND campana_id = $2::uuid
                   AND COALESCE(candidato_id::text, candidato_url, '') = COALESCE($3::text, $4, '')`,
                [flujoId, campanaId, row.candidato_id, row.url_perfil]
            );
            if (dup.rows.length) continue;
            await pool.query(
                `INSERT INTO sourcing_flujo_destinatarios
                 (flujo_id, campana_id, candidato_id, candidato_url, nombre, paso_actual, estado, fecha_ultimo_paso)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 1, 'pendiente', NOW())`,
                [flujoId, campanaId, row.candidato_id, row.url_perfil, row.nombre]
            );
            agregados += 1;
        }
        return agregados;
    }

    async function listFlujoDestinatariosPendientes() {
        const q = await pool.query(
            `SELECT fd.*, f.nombre AS flujo_nombre, f.pasos_json
             FROM sourcing_flujo_destinatarios fd
             JOIN sourcing_flujos f ON f.id = fd.flujo_id
             WHERE fd.estado NOT IN ('completado', 'respondio')`
        );
        return q.rows || [];
    }

    async function marcarFlujoEjecutado({ flujoDestinatarioId, resultado }) {
        const rowQ = await pool.query(
            `SELECT fd.*, f.pasos_json FROM sourcing_flujo_destinatarios fd
             JOIN sourcing_flujos f ON f.id = fd.flujo_id
             WHERE fd.id = $1::uuid`,
            [flujoDestinatarioId]
        );
        const row = rowQ.rows[0];
        if (!row) return null;
        const pasos = Array.isArray(row.pasos_json) ? row.pasos_json : JSON.parse(row.pasos_json || '[]');
        const historial = Array.isArray(row.historial_json) ? row.historial_json : JSON.parse(row.historial_json || '[]');
        historial.push({ paso: row.paso_actual, resultado, fecha: new Date().toISOString() });
        const ultimoPaso = pasos.reduce((m, p) => Math.max(m, Number(p.orden) || 0), 0);
        let nuevoPaso = row.paso_actual;
        let nuevoEstado = row.estado;
        if (resultado === 'respondio') {
            nuevoEstado = 'respondio';
        } else if (resultado === 'fallo') {
            nuevoEstado = 'pendiente';
        } else {
            nuevoPaso = row.paso_actual + 1;
            nuevoEstado = nuevoPaso > ultimoPaso ? 'completado' : 'ejecutado';
        }
        const q = await pool.query(
            `UPDATE sourcing_flujo_destinatarios
             SET paso_actual = $2, estado = $3, historial_json = $4::jsonb, fecha_ultimo_paso = NOW(), updated_at = NOW()
             WHERE id = $1::uuid RETURNING *`,
            [flujoDestinatarioId, nuevoPaso, nuevoEstado, JSON.stringify(historial)]
        );
        return q.rows[0] || null;
    }

    async function listFlujoDestinatariosByCampana(campanaId) {
        const q = await pool.query(
            `SELECT fd.*, f.nombre AS flujo_nombre, f.pasos_json
             FROM sourcing_flujo_destinatarios fd
             JOIN sourcing_flujos f ON f.id = fd.flujo_id
             WHERE fd.campana_id = $1::uuid`,
            [campanaId]
        );
        return q.rows || [];
    }

    return {
        listVacantes,
        createVacante,
        updateVacanteParsed,
        updateVacanteCriterios,
        updateVacantePostulacionesUrl,
        updateVacanteTextoOferta,
        archiveVacante,
        getVacanteById,
        listJobsByVacante,
        createJob,
        updateJobState,
        updateJobPhase,
        updateJobProgress,
        upsertCandidato,
        getJobById,
        getJobByIdRaw,
        isStaleActiveJob,
        reconcileStaleJob,
        reconcileAllStaleJobs,
        countCandidatosByJob,
        normalizeFuenteProgressKey,
        listCandidatosByJob,
        listCandidatosByJobPendingScore,
        listCandidatosByVacante,
        listRecentCandidatos,
        listCapturaCandidatos,
        deleteCandidato,
        updateCandidatoDecision,
        getCandidatosByIds,
        createCampana,
        addDestinatarios,
        updateCampana,
        listCampanas,
        getCampanaById,
        updateDestinatarioEstado,
        deleteDestinatario,
        refreshCampanaEstado,
        setCampanaEstado,
        updateCandidatoScore,
        resolveCampanaVacanteContext,
        getCandidatoContext,
        createPreentrevista,
        getPreentrevistaById,
        getPreentrevistaByTelefono,
        updatePreentrevista,
        appendPreentrevistaMensaje,
        getPreentrevistaMensajes,
        listPreentrevistasByVacante,
        listVacanteStats,
        getCandidatoById,
        updateCandidatoPerfil,
        saveDecisionEntrenamiento,
        listDecisionesEntrenamiento,
        createPublicacion,
        updatePublicacion,
        listPublicacionesByVacante,
        createFlujo,
        listFlujos,
        deleteFlujo,
        asignarFlujoCampana,
        listFlujoDestinatariosPendientes,
        marcarFlujoEjecutado,
        listFlujoDestinatariosByCampana
    };
}

module.exports = { createSourcingStore, parseUuidActor, normalizeFuenteProgressKey };
