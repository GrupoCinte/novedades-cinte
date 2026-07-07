/**
 * Acceso a datos del módulo Atracción de Talento.
 */

const { isValidFase } = require('./sourcingPipeline');

const JOB_SELECT =
    'id, vacante_id, estado, fase, fuentes, progreso, error_mensaje, created_at, updated_at';
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
    'x-ray': 'xray'
};

function normalizeFuenteProgressKey(fuente) {
    const key = String(fuente || '').trim().toLowerCase();
    return FUENTE_PROGRESS_MAP[key] || null;
}

function createSourcingStore({ pool }) {
    if (!pool) throw new Error('createSourcingStore: falta pool');

    async function listVacantes({ limit = 50 } = {}) {
        const q = await pool.query(
            `SELECT id, titulo, descripcion, criterios, estado, created_at, updated_at
             FROM sourcing_vacantes
             ORDER BY created_at DESC
             LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 50, 1), 200)]
        );
        return q.rows || [];
    }

    async function createVacante({ titulo, descripcion, criterios, estado, actorUserId }) {
        const nextEstado = estado || 'borrador';
        const q = await pool.query(
            `INSERT INTO sourcing_vacantes (titulo, descripcion, criterios, estado, created_by)
             VALUES ($1, $2, $3::jsonb, $4, $5::uuid)
             RETURNING id, titulo, descripcion, criterios, estado, created_at, updated_at`,
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
             RETURNING id, titulo, descripcion, criterios, estado, created_at, updated_at`,
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
            `SELECT id, titulo, descripcion, criterios, estado, created_at, updated_at
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

    async function createJob({ vacanteId, fuentes, actorUserId }) {
        const q = await pool.query(
            `INSERT INTO sourcing_jobs (vacante_id, estado, fase, fuentes, progreso, created_by)
             VALUES ($1::uuid, 'pendiente', 'descubrimiento', $2::jsonb, '{}'::jsonb, $3::uuid)
             RETURNING ${JOB_SELECT}`,
            [vacanteId, JSON.stringify(fuentes || {}), parseUuidActor(actorUserId)]
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
                    v.titulo AS vacante_titulo
             FROM sourcing_candidatos c
             JOIN sourcing_vacantes v ON v.id = c.vacante_id
             ORDER BY c.created_at DESC
             LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 200, 1), 500)]
        );
        return q.rows || [];
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

    return {
        listVacantes,
        createVacante,
        updateVacanteParsed,
        updateVacanteCriterios,
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
        updateCandidatoScore
    };
}

module.exports = { createSourcingStore, parseUuidActor, normalizeFuenteProgressKey };
