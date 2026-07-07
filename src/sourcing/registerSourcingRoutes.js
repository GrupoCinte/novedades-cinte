/**
 * Rutas REST del módulo Atracción de Talento (sourcing).
 * Acceso: panel JWT `atraccion` (roles super_admin, admin_ch, team_ch).
 */

const { z } = require('zod');
const { createVacanteSchema, createJobSchema, updateVacanteCriteriosSchema } = require('./schemas/vacante');
const { createSourcingStore } = require('./sourcingStore');
const { isBedrockConfigured, getBedrockModelId } = require('./services/bedrockClient');
const { parseVacanteFromDescripcion, mergeCriterios } = require('./services/parseVacante');
const { resolveActorUserIdForSession } = require('../resolveActorUserId');
const { dispatchSourcingJob, isWorkerConfigured, startIntegrationConnect, getIntegrationConnectStatus } = require('./services/workerClient');
const { getProviderConfig } = require('./services/integrationProviders');
const { createSourcingIntegrationsStore } = require('./sourcingIntegrationsStore');
const { normalizeProvider } = require('./services/integrationCrypto');
const { validateIntegrationCookies } = require('./services/validateIntegrationCookies');
const { registerSourcingInternalRoutes } = require('./registerSourcingInternalRoutes');

function assertSourcingRouteDeps(deps) {
    const required = ['app', 'pool', 'verificarToken', 'allowPanel'];
    for (const key of required) {
        if (deps == null || deps[key] == null) {
            throw new Error(`registerSourcingRoutes: falta dependencia "${key}"`);
        }
        if (key !== 'app' && key !== 'pool' && typeof deps[key] !== 'function') {
            throw new Error(`registerSourcingRoutes: "${key}" debe ser función`);
        }
    }
}

function formatZodError(err) {
    if (!err || !Array.isArray(err.errors)) return 'Datos inválidos';
    return err.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`).join(' · ');
}

function formatBedrockParseError(err) {
    const msg = String(err?.message || err || '');
    if (
        /unable to verify the first certificate|self[- ]signed certificate|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(
            msg
        )
    ) {
        return (
            'No se pudo verificar el certificado TLS de AWS Bedrock. ' +
            'Reinicie el backend con npm run dev (usa --use-system-ca) o, solo en local, ' +
            'AWS_BEDROCK_TLS_INSECURE=true en .env.'
        );
    }
    return msg || 'Error al analizar la vacante con Bedrock';
}

const sessionCookiesSchema = z.object({
    cookies: z.array(z.record(z.unknown())).min(1).max(500)
});

function registerSourcingRoutes(deps) {
    assertSourcingRouteDeps(deps);
    const { app, pool, verificarToken, allowPanel, adminActionLimiter, catalogLimiter, sourcingPollLimiter } = deps;
    const store = createSourcingStore({ pool });
    const integrations = createSourcingIntegrationsStore({ pool });
    const parseVacanteFn = deps.parseVacanteFromDescripcion || parseVacanteFromDescripcion;

    const readGuard = [verificarToken, allowPanel('atraccion'), catalogLimiter || ((req, res, next) => next())];
    const jobPollGuard = [verificarToken, allowPanel('atraccion')];
    const integracionesPollGuard = [
        verificarToken,
        allowPanel('atraccion'),
        sourcingPollLimiter || ((req, res, next) => next())
    ];
    const writeGuard = [
        verificarToken,
        allowPanel('atraccion'),
        adminActionLimiter || ((req, res, next) => next())
    ];

    app.get('/api/atraccion/health', ...readGuard, async (req, res) => {
        return res.json({
            ok: true,
            module: 'atraccion-talento',
            version: '0.8.0-scoring-bedrock',
            workerConfigured: isWorkerConfigured(),
            bedrockConfigured: isBedrockConfigured(),
            bedrockModelId: getBedrockModelId()
        });
    });

    app.get('/api/atraccion/vacantes', ...readGuard, async (req, res) => {
        try {
            const rows = await store.listVacantes({ limit: req.query.limit });
            return res.json({ ok: true, vacantes: rows });
        } catch (error) {
            console.error('[Sourcing] GET vacantes:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar vacantes' });
        }
    });

    app.post('/api/atraccion/vacantes', ...writeGuard, async (req, res) => {
        const parsed = createVacanteSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const manualCriterios = parsed.data.criterios || {};
            const actorUserId = await resolveActorUserIdForSession(pool, req.user || {});
            let row = await store.createVacante({
                titulo: parsed.data.titulo || null,
                descripcion: parsed.data.descripcion,
                criterios: manualCriterios,
                estado: 'borrador',
                actorUserId
            });

            let parseWarning = null;

            if (isBedrockConfigured()) {
                try {
                    const extracted = await parseVacanteFn(parsed.data.descripcion);
                    const mergedCriterios = mergeCriterios(manualCriterios, extracted.parsed);
                    row = await store.updateVacanteParsed({
                        id: row.id,
                        titulo: parsed.data.titulo || extracted.titulo,
                        criterios: mergedCriterios,
                        estado: 'borrador'
                    });
                } catch (parseError) {
                    console.error('[Sourcing] Bedrock parse vacante:', parseError);
                    row = await store.updateVacanteParsed({
                        id: row.id,
                        titulo: parsed.data.titulo || null,
                        criterios: {
                            ...manualCriterios,
                            parse_error: formatBedrockParseError(parseError)
                        },
                        estado: 'borrador'
                    });
                    parseWarning = row.criterios?.parse_error || 'No se pudieron extraer criterios';
                }
            } else {
                row = await store.updateVacanteParsed({
                    id: row.id,
                    titulo: parsed.data.titulo || null,
                    criterios: {
                        ...manualCriterios,
                        _meta: { parse_skipped: true, reason: 'bedrock_not_configured' }
                    },
                    estado: 'borrador'
                });
            }

            return res.status(201).json({
                ok: true,
                vacante: row,
                parseWarning: parseWarning || undefined
            });
        } catch (error) {
            console.error('[Sourcing] POST vacantes:', error);
            const detail = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
                ? ''
                : String(error?.message || '');
            return res.status(500).json({
                ok: false,
                error: detail ? `No se pudo crear la vacante: ${detail}` : 'No se pudo crear la vacante'
            });
        }
    });

    async function handleUpdateVacanteCriterios(req, res) {
        const parsed = updateVacanteCriteriosSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const row = await store.updateVacanteCriterios({
                id: vacante.id,
                criterios: parsed.data.criterios,
                confirmar: parsed.data.confirmar === true
            });
            if (!row) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            return res.json({ ok: true, vacante: row });
        } catch (error) {
            console.error('[Sourcing] update vacante criterios:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron actualizar los criterios' });
        }
    }

    app.patch('/api/atraccion/vacantes/:id/criterios', ...writeGuard, handleUpdateVacanteCriterios);
    app.post('/api/atraccion/vacantes/:id/criterios', ...writeGuard, handleUpdateVacanteCriterios);

    app.get('/api/atraccion/vacantes/:id', ...readGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const jobs = await store.listJobsByVacante(vacante.id);
            return res.json({ ok: true, vacante, jobs });
        } catch (error) {
            console.error('[Sourcing] GET vacante:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar la vacante' });
        }
    });

    app.get('/api/atraccion/integraciones', ...integracionesPollGuard, async (req, res) => {
        try {
            const rows = await integrations.listIntegraciones();
            return res.json({ ok: true, integraciones: rows });
        } catch (error) {
            console.error('[Sourcing] GET integraciones:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar integraciones' });
        }
    });

    app.post('/api/atraccion/integraciones/:provider/connect-worker', ...writeGuard, async (req, res) => {
        try {
            const provider = normalizeProvider(req.params.provider);
            const cfg = getProviderConfig(provider);
            if (!isWorkerConfigured()) {
                return res.status(503).json({
                    ok: false,
                    error: 'Worker no configurado. Defina SOURCING_WORKER_URL y reinicie el backend.'
                });
            }
            await integrations.setIntegracionEstado(provider, {
                estado: 'conectando',
                mensaje: `Abriendo navegador automático para ${cfg.label}…`
            });
            const workerResult = await startIntegrationConnect({ provider });
            const row = await integrations.getIntegracion(provider);
            return res.json({
                ok: true,
                integracion: row,
                mode: 'worker_browser',
                message:
                    'Se abrió una ventana de Chrome en este equipo. Inicie sesión en El Empleo ' +
                    'y espere a que CINTE guarde la sesión sola.',
                worker: workerResult
            });
        } catch (error) {
            console.error('[Sourcing] POST connect-worker integración:', error);
            return res.status(502).json({
                ok: false,
                error: error.message || 'No se pudo iniciar conexión con el worker'
            });
        }
    });

    app.get('/api/atraccion/integraciones/:provider/connect-worker/status', ...integracionesPollGuard, async (req, res) => {
        try {
            const provider = normalizeProvider(req.params.provider);
            if (!isWorkerConfigured()) {
                return res.status(503).json({ ok: false, error: 'Worker no configurado' });
            }
            const workerStatus = await getIntegrationConnectStatus({ provider });
            return res.json({ ok: true, provider, worker: workerStatus });
        } catch (error) {
            return res.status(502).json({ ok: false, error: error.message || 'No se pudo consultar el worker' });
        }
    });

    app.post('/api/atraccion/integraciones/:provider/connect', ...writeGuard, async (req, res) => {
        try {
            const provider = normalizeProvider(req.params.provider);
            const cfg = getProviderConfig(provider);
            await integrations.setIntegracionEstado(provider, {
                estado: 'conectando',
                mensaje: `Inicie sesión en la pestaña de ${cfg.label} y pulse «Guardar conexión».`
            });
            const row = await integrations.getIntegracion(provider);
            return res.json({
                ok: true,
                integracion: row,
                loginUrl: cfg.loginUrl,
                mode: 'browser_tab',
                message: 'Se abrirá El Empleo o LinkedIn en una pestaña de su navegador.'
            });
        } catch (error) {
            console.error('[Sourcing] POST connect integración:', error);
            return res.status(400).json({ ok: false, error: error.message || 'No se pudo iniciar conexión' });
        }
    });

    app.post('/api/atraccion/integraciones/:provider/session', ...writeGuard, async (req, res) => {
        const parsed = sessionCookiesSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const provider = normalizeProvider(req.params.provider);
            const validated = validateIntegrationCookies(provider, parsed.data.cookies);
            if (!validated.ok) {
                return res.status(400).json({ ok: false, error: validated.error });
            }
            const actorUserId = await resolveActorUserIdForSession(pool, req.user || {});
            const row = await integrations.saveIntegracionCookies(provider, validated.cookies, {
                actorUserId,
                mensaje: `Sesión guardada (${validated.summary?.total || validated.cookies.length} cookies)`
            });
            return res.json({ ok: true, integracion: row });
        } catch (error) {
            console.error('[Sourcing] POST session integración:', error);
            return res.status(400).json({ ok: false, error: error.message || 'No se pudo guardar sesión' });
        }
    });

    app.post('/api/atraccion/integraciones/:provider/disconnect', ...writeGuard, async (req, res) => {
        try {
            const provider = normalizeProvider(req.params.provider);
            const row = await integrations.disconnectIntegracion(provider);
            return res.json({ ok: true, integracion: row });
        } catch (error) {
            console.error('[Sourcing] POST disconnect integración:', error);
            return res.status(400).json({ ok: false, error: error.message || 'No se pudo desconectar' });
        }
    });

    app.post('/api/atraccion/jobs', ...writeGuard, async (req, res) => {
        const parsed = createJobSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const vacante = await store.getVacanteById(parsed.data.vacante_id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });

            const criterios = vacante.criterios && typeof vacante.criterios === 'object' ? vacante.criterios : {};
            if (criterios.filtros_confirmados !== true) {
                return res.status(400).json({
                    ok: false,
                    error: 'Debe revisar y confirmar los filtros de búsqueda antes de iniciar el job.'
                });
            }
            if (vacante.estado !== 'activa') {
                return res.status(400).json({
                    ok: false,
                    error: 'La vacante debe estar activa tras confirmar filtros.'
                });
            }

            const fuentes = parsed.data.fuentes || {};
            if (fuentes.elempleo && !(await integrations.isProviderConnected('elempleo'))) {
                return res.status(400).json({
                    ok: false,
                    error: 'Conecte El Empleo en Integraciones antes de usar esa fuente.'
                });
            }
            if (fuentes.linkedin && !(await integrations.isProviderConnected('linkedin'))) {
                return res.status(400).json({
                    ok: false,
                    error: 'Conecte LinkedIn en Integraciones antes de usar esa fuente.'
                });
            }

            const actorUserId = await resolveActorUserIdForSession(pool, req.user || {});
            let job = await store.createJob({
                vacanteId: vacante.id,
                fuentes: parsed.data.fuentes,
                actorUserId
            });

            let workerMessage = null;
            if (isWorkerConfigured()) {
                try {
                    await dispatchSourcingJob({ job, vacante });
                    job = await store.updateJobState({ jobId: job.id, estado: 'en_progreso' });
                    workerMessage = 'Búsqueda enviada al worker de scraping.';
                } catch (workerError) {
                    console.error('[Sourcing] dispatch worker:', workerError);
                    job = await store.updateJobState({
                        jobId: job.id,
                        estado: 'fallido',
                        errorMensaje: workerError.message || 'No se pudo contactar al worker'
                    });
                    return res.status(502).json({
                        ok: false,
                        error: `Worker no disponible: ${workerError.message || 'error'}`,
                        job
                    });
                }
            } else {
                workerMessage = 'Worker no configurado (SOURCING_WORKER_URL). Job registrado en pendiente.';
            }

            return res.status(202).json({
                ok: true,
                job,
                message: workerMessage
            });
        } catch (error) {
            console.error('[Sourcing] POST jobs:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo iniciar la búsqueda' });
        }
    });

    app.get('/api/atraccion/jobs/:id', ...jobPollGuard, async (req, res) => {
        try {
            const job = await store.getJobById(req.params.id);
            if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });
            const candidatos = await store.listCandidatosByJob(job.id);
            return res.json({ ok: true, job, candidatos });
        } catch (error) {
            console.error('[Sourcing] GET job:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar el job' });
        }
    });
    app.get('/api/atraccion/candidatos', ...readGuard, async (req, res) => {
        try {
            const candidatos = await store.listRecentCandidatos({ limit: req.query.limit });
            return res.json({ ok: true, candidatos });
        } catch (error) {
            console.error('[Sourcing] GET candidatos recientes:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar candidatos' });
        }
    });
    app.get('/api/atraccion/vacantes/:id/candidatos', ...readGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const candidatos = await store.listCandidatosByVacante(vacante.id);
            return res.json({ ok: true, vacante, candidatos });
        } catch (error) {
            console.error('[Sourcing] GET vacante candidatos:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar candidatos' });
        }
    });

    registerSourcingInternalRoutes({
        app,
        pool,
        integrations,
        runJobScoring: deps.runJobScoring,
        scoreCandidatoFn: deps.scoreCandidatoFn
    });
}

module.exports = { registerSourcingRoutes };
