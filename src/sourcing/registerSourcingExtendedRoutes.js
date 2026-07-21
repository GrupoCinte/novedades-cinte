'use strict';

const { z } = require('zod');
const { createZohoRecruitClient, parseSalarioMax } = require('./services/zohoRecruitClient');
const { enrichGithubProfile } = require('./services/enrichCandidato');
const { generateOfertaText } = require('./services/generateOferta');
const {
    dispatchSourcingJob,
    isWorkerConfigured,
    getWorkerUrl,
    getCallbackBaseUrl,
    getWorkerSecret
} = require('./services/workerClient');
const { evaluateCandidatoForPersist } = require('./services/inlineCandidatoScoring');

const zohoTokensSchema = z.object({
    access_token: z.string().min(1).optional(),
    refresh_token: z.string().min(1).optional()
});

const postulacionesJobSchema = z.object({
    vacante_id: z.string().uuid(),
    url_oferta: z.string().trim().min(1).transform((raw) => {
        const u = raw.trim();
        if (/^https?:\/\//i.test(u)) return u;
        return `https://${u.replace(/^\/+/, '')}`;
    }).pipe(z.string().url().refine((u) => u.includes('/empresas/'), {
        message: 'La URL debe ser del panel de empresas El Empleo (/co/empresas/)'
    }))
});

const rediscoverySchema = z.object({
    vacante_id: z.string().uuid()
});

const flujoSchema = z.object({
    nombre: z.string().trim().min(1).max(120),
    descripcion: z.string().trim().max(500).optional(),
    pasos: z.array(z.object({
        orden: z.number().int().min(1),
        canal: z.enum(['inmail', 'whatsapp', 'linkedin']),
        disparador: z.string().max(80).optional(),
        plantilla: z.string().max(4000).optional()
    })).max(20).optional().default([])
});

function mapZohoToCandidatoApi(z) {
    return {
        fuente: z.fuente || 'Zoho Recruit',
        nombre: z.nombre,
        url_perfil: z.url || null,
        perfil: {
            cargo: z.cargo,
            ciudad: z.ciudad,
            experiencia: z.experiencia,
            email: z.email,
            telefono: z.telefono,
            resumen_perfil: z.resumen_perfil,
            skills: z.skills,
            zoho_id: z.zoho_id,
            dias_inactivo: z.dias_inactivo,
            ultima_actividad: z.ultima_actividad,
            estado_zoho: z.estado_zoho,
            salario: z.salario
        },
        etapa: 'descubrimiento'
    };
}

/**
 * Rutas extendidas: Zoho, postulaciones, enrich, flujos, publicar.
 */
function registerSourcingExtendedRoutes(deps) {
    const { app, pool, store, integrations, writeGuard, readGuard, resolveActorUserId } = deps;

    const zohoClient = createZohoRecruitClient({
        getTokens: () => integrations.getZohoTokens(),
        saveTokens: (t) => integrations.saveZohoTokens(t)
    });

    // --- Zoho OAuth / estado ---
    app.get('/api/atraccion/integraciones/zoho/estado', ...readGuard, async (req, res) => {
        try {
            const row = await integrations.getIntegracion('zoho_recruit');
            return res.json({ ok: true, integracion: row, configured: zohoClient.isZohoConfigured() });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/atraccion/integraciones/zoho/tokens', ...writeGuard, async (req, res) => {
        const parsed = zohoTokensSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ ok: false, error: 'Tokens inválidos' });
        try {
            const actorUserId = await resolveActorUserId(req);
            const row = await integrations.saveZohoTokens(parsed.data, { actorUserId });
            return res.json({ ok: true, integracion: row });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.delete('/api/atraccion/integraciones/zoho', ...writeGuard, async (req, res) => {
        try {
            const row = await integrations.disconnectZoho();
            return res.json({ ok: true, integracion: row });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    // --- Jobs especiales ---
    app.post('/api/atraccion/jobs/postulaciones', ...writeGuard, async (req, res) => {
        const parsed = postulacionesJobSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: parsed.error.errors[0]?.message || 'Datos inválidos' });
        }
        try {
            const vacante = await store.getVacanteById(parsed.data.vacante_id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            if (!(await integrations.isProviderConnected('elempleo'))) {
                return res.status(400).json({ ok: false, error: 'Conecte El Empleo en Integraciones.' });
            }
            const actorUserId = await resolveActorUserId(req);
            const criterios = vacante.criterios || {};
            let job = await store.createJob({
                vacanteId: vacante.id,
                fuentes: { postulaciones: true },
                tipo: 'postulaciones',
                meta: {
                    url_oferta: parsed.data.url_oferta,
                    cargo: criterios.cargo || vacante.titulo,
                    skills: criterios.skills_requeridas || criterios.skills || []
                },
                actorUserId
            });
            if (isWorkerConfigured()) {
                await dispatchSourcingJob({ job, vacante });
                job = await store.updateJobState({ jobId: job.id, estado: 'en_progreso' });
            }
            const message = isWorkerConfigured()
                ? 'Importación de postulados enviada al worker.'
                : 'Job registrado, pero el worker no está configurado (SOURCING_WORKER_URL).';
            return res.status(202).json({ ok: true, job, message, workerConfigured: isWorkerConfigured() });
        } catch (error) {
            console.error('[Sourcing] postulaciones job:', error);
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/atraccion/jobs/rediscovery', ...writeGuard, async (req, res) => {
        const parsed = rediscoverySchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ ok: false, error: 'vacante_id requerido' });
        try {
            const vacante = await store.getVacanteById(parsed.data.vacante_id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            if (!(await integrations.isProviderConnected('zoho_recruit'))) {
                return res.status(400).json({ ok: false, error: 'Conecte Zoho Recruit en Integraciones.' });
            }
            const actorUserId = await resolveActorUserId(req);
            let job = await store.createJob({
                vacanteId: vacante.id,
                fuentes: { zoho: true },
                tipo: 'rediscovery',
                actorUserId
            });
            if (isWorkerConfigured()) {
                await dispatchSourcingJob({ job, vacante });
                job = await store.updateJobState({ jobId: job.id, estado: 'en_progreso' });
            }
            return res.status(202).json({ ok: true, job });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    // --- Enriquecer candidato ---
    app.post('/api/atraccion/candidatos/:id/enriquecer', ...writeGuard, async (req, res) => {
        try {
            const cand = await store.getCandidatoById(req.params.id);
            if (!cand) return res.status(404).json({ ok: false, error: 'Candidato no encontrado' });
            const fuente = String(cand.fuente || '').toLowerCase();
            const url = cand.url_perfil || '';
            let patch = {};
            if (fuente.includes('github') || url.includes('github.com')) {
                const r = await enrichGithubProfile(url);
                if (r.status !== 'ok') return res.json({ ok: true, status: r.status, mensaje: r.mensaje });
                patch = { ...r };
                delete patch.status;
            } else if (fuente.includes('linkedin') || url.includes('linkedin.com/in')) {
                return res.json({
                    ok: true,
                    status: 'pendiente_worker',
                    mensaje: 'Use el pipeline de enriquecimiento o EnrichLayer en el job.'
                });
            } else {
                return res.json({ ok: true, status: 'sin_datos', mensaje: 'Sin enriquecimiento para esta fuente.' });
            }
            const updated = await store.updateCandidatoPerfil(cand.id, patch);
            return res.json({ ok: true, candidato: updated });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    // --- Publicaciones ---
    app.post('/api/atraccion/vacantes/:id/generar-oferta', ...writeGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const texto = await generateOfertaText(vacante);
            return res.json({ ok: true, texto_oferta: texto });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/atraccion/vacantes/:id/publicaciones', ...readGuard, async (req, res) => {
        try {
            const rows = await store.listPublicacionesByVacante(req.params.id);
            return res.json({ ok: true, publicaciones: rows });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    async function dispatchPublish(vacanteId, canal, textoOferta, actorUserId) {
        const workerUrl = getWorkerUrl();
        if (!workerUrl) throw new Error('Worker no configurado');
        const pub = await store.createPublicacion({
            vacanteId,
            canal,
            textoOferta,
            payload: {},
            actorUserId
        });
        const res = await fetch(`${workerUrl}/publish/${canal}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                publicacion_id: pub.id,
                vacante_id: vacanteId,
                texto_oferta: textoOferta,
                callback_base_url: getCallbackBaseUrl(),
                callback_secret: getWorkerSecret(),
                criterios: (await store.getVacanteById(vacanteId))?.criterios || {}
            })
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            await store.updatePublicacion({ id: pub.id, estado: 'fallida', errorMensaje: err.slice(0, 500) });
            throw new Error(err.slice(0, 200));
        }
        await store.updatePublicacion({ id: pub.id, estado: 'en_progreso' });
        return pub;
    }

    app.post('/api/atraccion/vacantes/:id/publicar/elempleo', ...writeGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const texto = req.body?.texto_oferta || await generateOfertaText(vacante);
            const actorUserId = await resolveActorUserId(req);
            const pub = await dispatchPublish(vacante.id, 'elempleo', texto, actorUserId);
            return res.status(202).json({ ok: true, publicacion: pub });
        } catch (error) {
            return res.status(502).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/atraccion/vacantes/:id/publicar/linkedin', ...writeGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const texto = req.body?.texto_oferta || await generateOfertaText(vacante);
            const actorUserId = await resolveActorUserId(req);
            const pub = await dispatchPublish(vacante.id, 'linkedin', texto, actorUserId);
            return res.status(202).json({ ok: true, publicacion: pub });
        } catch (error) {
            return res.status(502).json({ ok: false, error: error.message });
        }
    });

    // --- Flujos ---
    app.get('/api/atraccion/flujos', ...readGuard, async (req, res) => {
        try {
            const flujos = await store.listFlujos();
            return res.json({ ok: true, flujos });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/atraccion/flujos', ...writeGuard, async (req, res) => {
        const parsed = flujoSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
        try {
            const actorUserId = await resolveActorUserId(req);
            const flujo = await store.createFlujo({
                nombre: parsed.data.nombre,
                descripcion: parsed.data.descripcion,
                pasos: parsed.data.pasos,
                actorUserId
            });
            return res.status(201).json({ ok: true, flujo });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.delete('/api/atraccion/flujos/:id', ...writeGuard, async (req, res) => {
        try {
            const deleted = await store.deleteFlujo(req.params.id);
            if (!deleted) return res.status(404).json({ ok: false, error: 'Flujo no encontrado' });
            return res.json({ ok: true, id: deleted.id });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/atraccion/campanas/:id/asignar-flujo', ...writeGuard, async (req, res) => {
        const flujoId = req.body?.flujo_id;
        if (!flujoId) return res.status(400).json({ ok: false, error: 'flujo_id requerido' });
        try {
            const agregados = await store.asignarFlujoCampana({ flujoId, campanaId: req.params.id });
            return res.json({ ok: true, agregados });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/atraccion/flujos/pendientes', ...readGuard, async (req, res) => {
        try {
            const rows = await store.listFlujoDestinatariosPendientes();
            const pendientes = [];
            for (const fd of rows) {
                const pasos = Array.isArray(fd.pasos_json) ? fd.pasos_json : JSON.parse(fd.pasos_json || '[]');
                const pasoDef = pasos.find((p) => Number(p.orden) === fd.paso_actual);
                if (!pasoDef) continue;
                const nombre = fd.nombre || '';
                const mensaje = String(pasoDef.plantilla || '').replace('[nombre]', nombre.split(' ')[0] || '');
                pendientes.push({
                    flujo_destinatario_id: fd.id,
                    candidato_url: fd.candidato_url,
                    nombre,
                    flujo: fd.flujo_nombre,
                    paso: fd.paso_actual,
                    canal: pasoDef.canal,
                    mensaje
                });
            }
            return res.json({ ok: true, pendientes, total: pendientes.length });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.post('/api/atraccion/flujos/marcar-ejecutado', ...writeGuard, async (req, res) => {
        try {
            const updated = await store.marcarFlujoEjecutado({
                flujoDestinatarioId: req.body?.flujo_destinatario_id,
                resultado: req.body?.resultado || 'ejecutado'
            });
            if (!updated) return res.status(404).json({ ok: false, error: 'No encontrado' });
            return res.json({ ok: true, destinatario: updated });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    app.get('/api/atraccion/flujos/campana/:campanaId', ...readGuard, async (req, res) => {
        try {
            const candidatos = await store.listFlujoDestinatariosByCampana(req.params.campanaId);
            return res.json({ ok: true, candidatos });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    // LinkedIn extension: importar candidatos capturados desde el navegador
    app.post('/api/atraccion/integraciones/linkedin/extension-candidatos', ...writeGuard, async (req, res) => {
        const vacanteId = req.body?.vacante_id;
        const items = req.body?.candidatos;
        if (!vacanteId || !Array.isArray(items) || !items.length) {
            return res.status(400).json({ ok: false, error: 'vacante_id y candidatos[] requeridos' });
        }
        try {
            const vacante = await store.getVacanteById(vacanteId);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const actorUserId = await resolveActorUserId(req);
            const job = await store.createJob({
                vacanteId,
                fuentes: { linkedin: true },
                actorUserId,
                tipo: 'extension',
                meta: { origen: 'extension_linkedin' }
            });
            await store.updateJobState({ jobId: job.id, estado: 'completado', fase: 'descubrimiento' });
            let count = 0;
            for (const raw of items.slice(0, 50)) {
                const nombre = String(raw?.nombre || '').trim();
                const urlPerfil = String(raw?.url || raw?.url_perfil || '').trim() || null;
                if (!nombre && !urlPerfil) continue;
                const perfil = raw?.perfil && typeof raw.perfil === 'object' ? raw.perfil : {};
                await store.upsertCandidato({
                    jobId: job.id,
                    vacanteId,
                    fuente: 'LinkedIn',
                    urlPerfil,
                    nombre: nombre || 'Sin nombre',
                    perfil: { ...perfil, extension: true },
                    etapa: 'descubrimiento',
                    enriquecido: Boolean(perfil.datos_completos)
                });
                count += 1;
            }
            return res.json({ ok: true, job_id: job.id, importados: count });
        } catch (error) {
            console.error('[Sourcing] extension-candidatos:', error);
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    // Internal: búsqueda Zoho (worker)
    app.post('/api/atraccion/internal/zoho/search', deps.workerGuard || [], async (req, res) => {
        try {
            const criterios = req.body?.criterios || {};
            const maxC = Math.min(Number(req.body?.max_candidatos) || 30, 100);
            const modo = req.body?.modo || 'busqueda';
            const cargo = criterios.cargo || '';
            const skills = criterios.skills_requeridas || criterios.skills || [];
            const salarioMax = parseSalarioMax(criterios);
            let raw = [];
            if (modo === 'rediscovery') {
                raw = await zohoClient.rediscoveryCandidates({ cargo, skills, maxC });
            } else {
                raw = await zohoClient.searchCandidates({
                    cargo,
                    ciudad: criterios.ciudad || '',
                    maxC,
                    skills,
                    experienciaMin: criterios.experiencia_min || 0,
                    salarioMax
                });
            }
            const candidatos = raw.map(mapZohoToCandidatoApi);
            return res.json({ ok: true, candidatos });
        } catch (error) {
            console.error('[Sourcing] internal zoho search:', error);
            return res.status(502).json({ ok: false, error: error.message, candidatos: [] });
        }
    });

    // Internal: callback publicación
    app.post('/api/atraccion/internal/publicaciones/:id/complete', deps.workerGuard || [], async (req, res) => {
        try {
            const pub = await store.updatePublicacion({
                id: req.params.id,
                estado: req.body?.estado || 'publicada',
                urlPublicada: req.body?.url_publicada,
                errorMensaje: req.body?.error_mensaje
            });
            const url = String(req.body?.url_publicada || '').trim();
            if (pub?.vacante_id && pub?.canal === 'elempleo' && pub?.estado === 'publicada' && url.includes('/empresas/')) {
                await store.updateVacantePostulacionesUrl({ id: pub.vacante_id, url });
            }
            return res.json({ ok: true, publicacion: pub });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });
}

module.exports = { registerSourcingExtendedRoutes, mapZohoToCandidatoApi };
