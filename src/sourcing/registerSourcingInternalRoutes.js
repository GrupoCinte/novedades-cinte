'use strict';

const { z } = require('zod');
const { createSourcingStore } = require('./sourcingStore');
const { createSourcingIntegrationsStore } = require('./sourcingIntegrationsStore');
const { normalizeProvider } = require('./services/integrationCrypto');
const { validateIntegrationCookies } = require('./services/validateIntegrationCookies');
const { getWorkerSecret } = require('./services/workerClient');
const { runJobScoring } = require('./services/runJobScoring');

const candidatoPayloadSchema = z.object({
    fuente: z.string().trim().min(1).max(80),
    nombre: z.string().trim().max(200).optional().nullable(),
    url_perfil: z.string().trim().max(2000).optional().nullable(),
    perfil: z.record(z.unknown()).optional().default({}),
    etapa: z.enum(['descubrimiento', 'extraccion', 'enriquecimiento', 'scoring', 'completo']).optional(),
    enriquecido: z.boolean().optional()
});

const phaseSchema = z.object({
    fase: z.enum(['descubrimiento', 'extraccion', 'enriquecimiento', 'scoring']),
    estado: z.enum(['pendiente', 'en_progreso', 'completado', 'fallido', 'omitido']).optional(),
    count: z.number().int().min(0).optional(),
    total: z.number().int().min(0).optional(),
    error: z.string().max(500).optional().nullable()
});

const candidatosBatchSchema = z.object({
    candidatos: z.array(candidatoPayloadSchema).max(100)
});

const progressSchema = z.object({
    fuente: z.string().trim().min(1).max(80),
    estado: z.enum(['pendiente', 'en_progreso', 'completado', 'fallido', 'omitido']).optional(),
    count: z.number().int().min(0).optional(),
    error: z.string().max(500).optional().nullable()
});

const completeSchema = z.object({
    estado: z.enum(['completado', 'parcial', 'fallido']).optional().default('completado'),
    error_mensaje: z.string().max(1000).optional().nullable()
});

const integrationStatusSchema = z.object({
    estado: z.enum(['desconectado', 'conectando', 'conectado', 'expirado', 'error']),
    mensaje: z.string().max(500).optional().nullable()
});

const integrationCookiesSchema = z.object({
    cookies: z.array(z.record(z.unknown())).max(500),
    mensaje: z.string().max(500).optional().nullable()
});

function assertInternalDeps(deps) {
    if (!deps?.app || !deps?.pool) {
        throw new Error('registerSourcingInternalRoutes: falta app o pool');
    }
}

function workerAuthMiddleware(req, res, next) {
    const expected = getWorkerSecret();
    const got = String(req.headers['x-sourcing-worker-key'] || req.headers['x-sourcing-worker-secret'] || '').trim();
    if (!expected || got !== expected) {
        return res.status(401).json({ ok: false, error: 'No autorizado (worker)' });
    }
    return next();
}

function formatZodError(err) {
    if (!err || !Array.isArray(err.errors)) return 'Datos inválidos';
    return err.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`).join(' · ');
}

function registerSourcingInternalRoutes(deps) {
    assertInternalDeps(deps);
    const { app, pool } = deps;
    const store = createSourcingStore({ pool });
    const integrations = deps.integrations || createSourcingIntegrationsStore({ pool });
    const guard = [workerAuthMiddleware];

    app.post('/api/atraccion/internal/jobs/:id/phase', ...guard, async (req, res) => {
        const parsed = phaseSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const job = await store.updateJobPhase({
                jobId: req.params.id,
                fase: parsed.data.fase,
                patch: {
                    estado: parsed.data.estado,
                    count: parsed.data.count,
                    total: parsed.data.total,
                    error: parsed.data.error || null
                }
            });
            if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });
            return res.json({ ok: true, job });
        } catch (error) {
            console.error('[Sourcing] internal phase:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar fase' });
        }
    });

    app.post('/api/atraccion/internal/jobs/:id/progress', ...guard, async (req, res) => {
        const parsed = progressSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const job = await store.updateJobProgress({
                jobId: req.params.id,
                fuente: parsed.data.fuente,
                patch: {
                    estado: parsed.data.estado,
                    count: parsed.data.count,
                    error: parsed.data.error || null,
                    updated_at: new Date().toISOString()
                }
            });
            if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });
            return res.json({ ok: true, job });
        } catch (error) {
            console.error('[Sourcing] internal progress:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar progreso' });
        }
    });

    app.post('/api/atraccion/internal/jobs/:id/candidatos', ...guard, async (req, res) => {
        const parsed = candidatosBatchSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const job = await store.getJobById(req.params.id);
            if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });

            const vacante = await store.getVacanteById(job.vacante_id);
            const evaluateFn = deps.evaluateCandidatoForPersist;
            const scoreFn = deps.scoreCandidatoFn;

            let inserted = 0;
            let skipped = 0;
            let lastFuente = null;
            for (const c of parsed.data.candidatos) {
                let score = c.perfil?.score_ia;
                let resumen = c.perfil?.resumen_ia;
                if (evaluateFn && vacante) {
                    const evalResult = await evaluateFn({
                        vacante,
                        candidatoPayload: c,
                        store,
                        scoreFn
                    });
                    if (!evalResult.persist) {
                        skipped += 1;
                        continue;
                    }
                    if (evalResult.score != null) {
                        score = evalResult.score;
                        resumen = evalResult.resumen;
                    }
                }
                const perfil = { ...(c.perfil || {}) };
                if (score != null) {
                    perfil.score_ia = score;
                    if (resumen) perfil.resumen_ia = resumen;
                }
                const row = await store.upsertCandidato({
                    jobId: job.id,
                    vacanteId: job.vacante_id,
                    fuente: c.fuente,
                    urlPerfil: c.url_perfil,
                    nombre: c.nombre,
                    perfil,
                    etapa: c.etapa,
                    enriquecido: c.enriquecido,
                    resumeeId: perfil?.resumee_id || null
                });
                if (score != null && row?.id) {
                    await store.updateCandidatoScore({
                        candidatoId: row.id,
                        score,
                        resumenScore: resumen || null
                    });
                }
                if (deps.zohoPushEnabled && deps.zohoClient && c.fuente?.includes('Zoho')) {
                    try {
                        await deps.zohoClient.createCandidate(row || c);
                    } catch (e) {
                        console.warn('[Sourcing] zoho push discover:', e.message);
                    }
                }
                lastFuente = c.fuente;
                inserted += 1;
            }

            const totalCandidatos = await store.countCandidatosByJob(job.id);
            const jobActive = job.estado === 'pendiente' || job.estado === 'en_progreso';
            const lastCandidate = parsed.data.candidatos[parsed.data.candidatos.length - 1];
            const etapa = lastCandidate?.etapa || 'descubrimiento';

            if (jobActive && etapa === 'descubrimiento') {
                if (lastFuente) {
                    const fuenteKey = store.normalizeFuenteProgressKey(lastFuente);
                    if (fuenteKey) {
                        await store.updateJobProgress({
                            jobId: job.id,
                            fuente: fuenteKey,
                            patch: {
                                estado: 'en_progreso',
                                count: totalCandidatos
                            }
                        });
                    }
                }
                await store.updateJobPhase({
                    jobId: job.id,
                    fase: 'descubrimiento',
                    patch: {
                        estado: 'en_progreso',
                        count: totalCandidatos,
                        total: totalCandidatos
                    }
                });
            } else if (jobActive && (etapa === 'extraccion' || etapa === 'enriquecimiento')) {
                await store.updateJobPhase({
                    jobId: job.id,
                    fase: etapa,
                    patch: {
                        ...(job.fase === etapa ? { estado: 'en_progreso' } : {}),
                        count: totalCandidatos,
                        total: totalCandidatos
                    }
                });
            }

            return res.json({ ok: true, inserted, skipped, total: totalCandidatos });
        } catch (error) {
            console.error('[Sourcing] internal candidatos:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron guardar candidatos' });
        }
    });

    app.post('/api/atraccion/internal/jobs/:id/score', ...guard, async (req, res) => {
        try {
            const job = await store.getJobByIdRaw(req.params.id);
            if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });
            if (job.estado === 'cancelado') {
                return res.status(400).json({ ok: false, error: 'Job cancelado' });
            }

            const runFn = deps.runJobScoring || runJobScoring;
            const result = await runFn({
                jobId: job.id,
                store,
                scoreFn: deps.scoreCandidatoFn
            });

            return res.json({
                ok: true,
                scored: result.scored ?? 0,
                failed: result.failed ?? 0,
                skipped: result.skipped === true,
                reason: result.reason || null
            });
        } catch (error) {
            console.error('[Sourcing] internal score:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo ejecutar scoring' });
        }
    });

    app.post('/api/atraccion/internal/jobs/:id/complete', ...guard, async (req, res) => {
        const parsed = completeSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const job = await store.updateJobState({
                jobId: req.params.id,
                estado: parsed.data.estado,
                errorMensaje: parsed.data.error_mensaje || null,
                fase: parsed.data.estado === 'completado' || parsed.data.estado === 'parcial'
                    ? 'completado'
                    : undefined
            });
            if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });
            return res.json({ ok: true, job });
        } catch (error) {
            console.error('[Sourcing] internal complete:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo completar el job' });
        }
    });

    app.get('/api/atraccion/internal/integraciones/:provider/cookies', ...guard, async (req, res) => {
        try {
            const provider = normalizeProvider(req.params.provider);
            const cookies = await integrations.getIntegracionCookies(provider);
            if (!cookies) {
                return res.status(404).json({ ok: false, error: 'Sesión no conectada' });
            }
            return res.json({ ok: true, provider, cookies });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error.message || 'Proveedor inválido' });
        }
    });

    app.put('/api/atraccion/internal/integraciones/:provider/cookies', ...guard, async (req, res) => {
        const parsed = integrationCookiesSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const provider = normalizeProvider(req.params.provider);
            const validated = validateIntegrationCookies(provider, parsed.data.cookies);
            if (!validated.ok) {
                return res.status(400).json({ ok: false, error: validated.error });
            }
            const row = await integrations.saveIntegracionCookies(provider, validated.cookies, {
                mensaje: parsed.data.mensaje || null
            });
            return res.json({ ok: true, integracion: row });
        } catch (error) {
            console.error('[Sourcing] internal save cookies:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo guardar sesión' });
        }
    });

    app.patch('/api/atraccion/internal/integraciones/:provider/status', ...guard, async (req, res) => {
        const parsed = integrationStatusSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const provider = normalizeProvider(req.params.provider);
            const row = await integrations.setIntegracionEstado(provider, {
                estado: parsed.data.estado,
                mensaje: parsed.data.mensaje || null
            });
            return res.json({ ok: true, integracion: row });
        } catch (error) {
            console.error('[Sourcing] internal integration status:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar estado' });
        }
    });
}

module.exports = { registerSourcingInternalRoutes, workerAuthMiddleware };
