/**
 * Rutas REST del módulo Atracción de Talento (sourcing).
 * Acceso: panel JWT `atraccion` (roles super_admin, admin_ch, team_ch).
 */

const { z } = require('zod');
const { createVacanteSchema, createJobSchema, updateVacanteCriteriosSchema } = require('./schemas/vacante');
const {
    createCampanaSchema,
    updateCampanaSchema,
    addDestinatariosSchema,
    updateDestinatarioSchema,
    updateDecisionSchema,
    contactoIntakeSchema
} = require('./schemas/campana');
const { renderPlantillas } = require('./services/plantillaVars');
const { CAMPOS_FORMULARIO } = require('./services/plantillasDefault');
const { createSourcingStore } = require('./sourcingStore');
const { isBedrockConfigured, getBedrockModelId } = require('./services/bedrockClient');
const { parseVacanteFromDescripcion, mergeCriterios } = require('./services/parseVacante');
const { computeFiltrosFaltantes } = require('./services/filtrosObligatorios');
const { resolveActorUserIdForSession } = require('../resolveActorUserId');
const { dispatchSourcingJob, isWorkerConfigured, startIntegrationConnect, getIntegrationConnectStatus, getWorkerUrl } = require('./services/workerClient');
const { getProviderConfig } = require('./services/integrationProviders');
const { createSourcingIntegrationsStore } = require('./sourcingIntegrationsStore');
const { normalizeProvider } = require('./services/integrationCrypto');
const { validateIntegrationCookies } = require('./services/validateIntegrationCookies');
const { registerSourcingInternalRoutes, workerAuthMiddleware } = require('./registerSourcingInternalRoutes');
const { registerSourcingExtendedRoutes } = require('./registerSourcingExtendedRoutes');
const { evaluateCandidatoForPersist } = require('./services/inlineCandidatoScoring');
const { createZohoRecruitClient } = require('./services/zohoRecruitClient');

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
            version: '0.9.0-paridad-scrapingat',
            workerConfigured: isWorkerConfigured(),
            bedrockConfigured: isBedrockConfigured(),
            bedrockModelId: getBedrockModelId(),
            scoreMin: Number(process.env.SOURCING_SCORE_MIN || 70),
            pushZoho: String(process.env.SOURCING_PUSH_ZOHO || '').toLowerCase() === 'true',
            inmailAuto: String(process.env.ATRACCION_INMAIL_AUTO || '').toLowerCase() === 'true'
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

    // Agregados por vacante para las tarjetas de Shortlist (una sola llamada).
    // Debe ir ANTES de '/vacantes/:id' para que 'stats' no se interprete como id.
    app.get('/api/atraccion/vacantes/stats', ...readGuard, async (req, res) => {
        try {
            const scoreMin = Number(process.env.ATRACCION_SCORE_MIN || process.env.SOURCING_SCORE_MIN || 70);
            const stats = await store.listVacanteStats({ scoreMin });
            return res.json({ ok: true, stats });
        } catch (error) {
            console.error('[Sourcing] GET vacantes stats:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar los indicadores' });
        }
    });

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

    app.post('/api/atraccion/vacantes/:id/archivar', ...writeGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const row = await store.archiveVacante(vacante.id);
            if (!row) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            return res.json({ ok: true, vacante: row });
        } catch (error) {
            console.error('[Sourcing] POST archivar vacante:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo archivar la vacante' });
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
            const faltantes = computeFiltrosFaltantes(criterios);
            if (faltantes.length > 0) {
                return res.status(400).json({
                    ok: false,
                    error: `Complete los filtros obligatorios antes de iniciar la búsqueda: ${faltantes.map((f) => f.label).join(', ')}.`,
                    filtros_faltantes: faltantes
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
            if (fuentes.zoho && !(await integrations.isProviderConnected('zoho_recruit'))) {
                return res.status(400).json({
                    ok: false,
                    error: 'Conecte Zoho Recruit en Integraciones antes de usar esa fuente.'
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
    app.get('/api/atraccion/captura', ...readGuard, async (req, res) => {
        try {
            const candidatos = await store.listCapturaCandidatos({
                q: req.query.q,
                fuente: req.query.fuente,
                limit: req.query.limit
            });
            return res.json({ ok: true, candidatos });
        } catch (error) {
            console.error('[Sourcing] GET captura:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar la base de captura' });
        }
    });
    app.delete('/api/atraccion/candidatos/:id', ...writeGuard, async (req, res) => {
        try {
            const deleted = await store.deleteCandidato(req.params.id);
            if (!deleted) return res.status(404).json({ ok: false, error: 'Candidato no encontrado' });
            return res.json({ ok: true, id: deleted.id });
        } catch (error) {
            console.error('[Sourcing] DELETE candidato:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar el candidato' });
        }
    });
    app.patch('/api/atraccion/candidatos/:id/decision', ...writeGuard, async (req, res) => {
        const parsed = updateDecisionSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const cand = await store.getCandidatoById(req.params.id);
            if (!cand) return res.status(404).json({ ok: false, error: 'Candidato no encontrado' });
            const updated = await store.updateCandidatoDecision(req.params.id, parsed.data.decision);
            if (!updated) return res.status(404).json({ ok: false, error: 'Candidato no encontrado' });

            const actorUserId = await resolveActorUserIdForSession(pool, req.user || {});
            const vacante = await store.getVacanteById(cand.vacante_id);
            const criterios = vacante?.criterios || {};
            await store.saveDecisionEntrenamiento({
                vacanteId: cand.vacante_id,
                urlPerfil: cand.url_perfil,
                nombre: cand.nombre,
                cargoBuscado: criterios.cargo || vacante?.titulo,
                cargoCandidato: cand.perfil?.cargo,
                ciudad: cand.perfil?.ciudad,
                fuente: cand.fuente,
                decision: parsed.data.decision,
                scoreIa: cand.score,
                resumenIa: cand.resumen_score,
                perfilSnapshot: cand.perfil,
                actorUserId
            });

            if (parsed.data.decision === 'aprobado'
                && String(process.env.SOURCING_PUSH_ZOHO || '').toLowerCase() === 'true') {
                try {
                    const zohoClient = createZohoRecruitClient({
                        getTokens: () => integrations.getZohoTokens(),
                        saveTokens: (t) => integrations.saveZohoTokens(t)
                    });
                    await zohoClient.createCandidate(cand);
                } catch (zohoErr) {
                    console.warn('[Sourcing] push Zoho:', zohoErr.message);
                }
            }

            return res.json({ ok: true, id: updated.id, decision: updated.decision });
        } catch (error) {
            console.error('[Sourcing] PATCH decision candidato:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar la decisión' });
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

    // Preentrevistas de una vacante (seguimiento tipo "En ingreso").
    app.get('/api/atraccion/vacantes/:id/preentrevistas', ...readGuard, async (req, res) => {
        try {
            const vacante = await store.getVacanteById(req.params.id);
            if (!vacante) return res.status(404).json({ ok: false, error: 'Vacante no encontrada' });
            const preentrevistas = await store.listPreentrevistasByVacante(vacante.id);
            return res.json({ ok: true, preentrevistas });
        } catch (error) {
            console.error('[Sourcing] GET vacante preentrevistas:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar las preentrevistas' });
        }
    });

    // --- Campañas de contacto (selección de candidatos + estados) ---
    app.get('/api/atraccion/campanas', ...readGuard, async (req, res) => {
        try {
            const campanas = await store.listCampanas({ limit: req.query.limit });
            return res.json({ ok: true, campanas });
        } catch (error) {
            console.error('[Sourcing] GET campanas:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar las campañas' });
        }
    });

    app.get('/api/atraccion/campanas/:id', ...readGuard, async (req, res) => {
        try {
            const campana = await store.getCampanaById(req.params.id);
            if (!campana) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
            return res.json({ ok: true, campana });
        } catch (error) {
            console.error('[Sourcing] GET campana:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar la campaña' });
        }
    });

    app.post('/api/atraccion/campanas', ...writeGuard, async (req, res) => {
        const parsed = createCampanaSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const actorUserId = await resolveActorUserIdForSession(pool, req.user || {});
            const campana = await store.createCampana({
                nombre: parsed.data.nombre,
                mensajePlantilla: parsed.data.mensaje_plantilla,
                canalDefault: parsed.data.canal_default,
                candidatoIds: parsed.data.candidato_ids,
                plantillas: parsed.data.plantillas,
                vacanteId: parsed.data.vacante_id,
                actorUserId
            });
            if (!campana.destinatarios || campana.destinatarios.length === 0) {
                return res.status(400).json({
                    ok: false,
                    error: 'A una campaña solo pasan candidatos aprobados. Apruebe al menos un candidato con datos de contacto.'
                });
            }
            return res.status(201).json({ ok: true, campana });
        } catch (error) {
            console.error('[Sourcing] POST campana:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo crear la campaña' });
        }
    });

    app.patch('/api/atraccion/campanas/:id', ...writeGuard, async (req, res) => {
        const parsed = updateCampanaSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const existing = await store.getCampanaById(req.params.id);
            if (!existing) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
            const campana = await store.updateCampana({
                campanaId: req.params.id,
                nombre: parsed.data.nombre,
                mensajePlantilla: parsed.data.mensaje_plantilla,
                plantillas: parsed.data.plantillas
            });
            return res.json({ ok: true, campana });
        } catch (error) {
            console.error('[Sourcing] PATCH campana:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar la campaña' });
        }
    });

    app.post('/api/atraccion/campanas/:id/destinatarios', ...writeGuard, async (req, res) => {
        const parsed = addDestinatariosSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const result = await store.addDestinatarios({
                campanaId: req.params.id,
                candidatoIds: parsed.data.candidato_ids,
                manuales: parsed.data.manuales
            });
            if (!result) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
            if (!result.agregados.length) {
                return res.status(400).json({
                    ok: false,
                    error: 'No se agregó nadie: los candidatos ya estaban en la campaña o no están aprobados.'
                });
            }
            return res.json({ ok: true, agregados: result.agregados.length, campana: result.campana });
        } catch (error) {
            console.error('[Sourcing] POST destinatarios:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron agregar destinatarios' });
        }
    });

    app.patch('/api/atraccion/campanas/:id/destinatarios/:did', ...writeGuard, async (req, res) => {
        const parsed = updateDestinatarioSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const dest = await store.updateDestinatarioEstado({
                campanaId: req.params.id,
                destinatarioId: req.params.did,
                estado: parsed.data.estado,
                errorMensaje: parsed.data.error_mensaje
            });
            if (!dest) return res.status(404).json({ ok: false, error: 'Destinatario no encontrado' });
            const { campana } = await store.refreshCampanaEstado(req.params.id);
            return res.json({ ok: true, destinatario: dest, campana });
        } catch (error) {
            console.error('[Sourcing] PATCH destinatario:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar el destinatario' });
        }
    });

    app.delete('/api/atraccion/campanas/:id/destinatarios/:did', ...writeGuard, async (req, res) => {
        try {
            const deleted = await store.deleteDestinatario(req.params.id, req.params.did);
            if (!deleted) return res.status(404).json({ ok: false, error: 'Destinatario no encontrado' });
            await store.refreshCampanaEstado(req.params.id);
            const campana = await store.getCampanaById(req.params.id);
            return res.json({ ok: true, id: deleted.id, campana });
        } catch (error) {
            console.error('[Sourcing] DELETE destinatario:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar el destinatario' });
        }
    });

    app.post('/api/atraccion/campanas/:id/enviar', ...writeGuard, async (req, res) => {
        try {
            const campana = await store.getCampanaById(req.params.id);
            if (!campana) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });

            const agentWebhook = String(process.env.N8N_ATCONTACTO_WEBHOOK_URL || '').trim();
            const legacyWebhook = String(process.env.N8N_CONTACTO_WEBHOOK_URL || '').trim();
            const envioHabilitado = String(process.env.ATRACCION_CAMPANA_ENVIO || '').toLowerCase() === 'true';
            const webhookUrl = agentWebhook || legacyWebhook;

            const inmailAuto = String(process.env.ATRACCION_INMAIL_AUTO || '').toLowerCase() === 'true';
            const workerUrl = getWorkerUrl();

            // InMail LinkedIn automático (worker Playwright)
            if (inmailAuto && workerUrl) {
                const inmailPendientes = (campana.destinatarios || [])
                    .filter((d) => d.estado === 'pendiente' && d.canal === 'inmail' && d.contacto);
                for (const d of inmailPendientes) {
                    const mensaje = d.mensaje || campana.mensaje_plantilla || '';
                    const nombre = d.nombre || 'Candidato';
                    try {
                        const resp = await fetch(`${workerUrl}/inmail/send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                candidato_url: d.contacto,
                                nombre,
                                mensaje: mensaje.replace('[nombre]', nombre.split(' ')[0] || ''),
                                destinatario_id: d.id,
                                campana_id: campana.id
                            })
                        });
                        const data = await resp.json().catch(() => ({}));
                        await store.updateDestinatarioEstado({
                            campanaId: campana.id,
                            destinatarioId: d.id,
                            estado: data.ok ? 'enviado' : 'fallido',
                            errorMensaje: data.ok ? null : (data.mensaje || 'Error InMail')
                        });
                    } catch (inmailErr) {
                        await store.updateDestinatarioEstado({
                            campanaId: campana.id,
                            destinatarioId: d.id,
                            estado: 'fallido',
                            errorMensaje: inmailErr.message
                        });
                    }
                }
                await store.refreshCampanaEstado(campana.id);
            }

            if (!webhookUrl || !envioHabilitado) {
                const refreshed = await store.getCampanaById(campana.id);
                return res.json({
                    ok: true,
                    dispatched: false,
                    mensaje: inmailAuto
                        ? 'InMail procesado. WhatsApp: configure N8N_ATCONTACTO_WEBHOOK_URL y ATRACCION_CAMPANA_ENVIO=true.'
                        : 'Envío automático WhatsApp no configurado. Marque destinatarios manualmente '
                            + '(configure N8N_ATCONTACTO_WEBHOOK_URL y ATRACCION_CAMPANA_ENVIO=true).',
                    campana: refreshed
                });
            }

            const pendientes = (campana.destinatarios || [])
                .filter((d) => d.estado === 'pendiente' && d.canal === 'whatsapp' && d.contacto);

            if (!pendientes.length) {
                return res.json({
                    ok: true,
                    dispatched: false,
                    mensaje: 'No hay destinatarios de WhatsApp pendientes. Los de InMail (LinkedIn) se gestionan manualmente.',
                    campana
                });
            }

            const analista = String(
                req.user?.name || req.user?.given_name || req.user?.nombre
                || (req.user?.email ? String(req.user.email).split('@')[0] : '') || 'Atracción de Talento'
            ).trim();
            const portalBaseUrl = String(process.env.PORTAL_BASE_URL || '').trim();
            const campVacanteCtx = await store.resolveCampanaVacanteContext(campana.id);

            const destinatariosPayload = [];
            for (const d of pendientes) {
                const ctx = d.candidato_id ? await store.getCandidatoContext(d.candidato_id) : null;
                const criterios = ctx?.vacante_criterios || campVacanteCtx?.criterios || {};
                const vacanteTitulo = ctx?.vacante_titulo || campVacanteCtx?.vacante_titulo || campana.nombre;
                const vacanteCodigo = ctx?.vacante_codigo ?? campVacanteCtx?.vacante_codigo ?? null;
                const candidato = ctx
                    ? { nombre: ctx.nombre, perfil: ctx.perfil, fuente: ctx.fuente, vacante_titulo: vacanteTitulo }
                    : {
                        nombre: d.nombre,
                        perfil: {
                            telefono: d.contacto || null,
                            correo: d.correo || null
                        },
                        fuente: 'contacto manual',
                        vacante_titulo: vacanteTitulo
                    };
                const plantillasRender = renderPlantillas(campana.plantillas || {}, { candidato, criterios, analista });

                const baseConocimiento = {
                    candidato: {
                        nombre: candidato.nombre,
                        perfil: candidato.perfil || {},
                        correo: d.correo || null,
                        telefono: d.contacto || null
                    },
                    vacante: {
                        titulo: vacanteTitulo,
                        codigo: vacanteCodigo,
                        criterios
                    },
                    campos_requeridos: CAMPOS_FORMULARIO
                };

                const pre = await store.createPreentrevista({
                    destinatarioId: d.id,
                    campanaId: campana.id,
                    candidatoId: d.candidato_id,
                    telefono: d.contacto,
                    fase: 'apertura',
                    baseConocimiento,
                    analista
                });

                destinatariosPayload.push({
                    destinatario_id: d.id,
                    preentrevista_id: pre.id,
                    candidato_id: d.candidato_id,
                    nombre: d.nombre,
                    telefono: d.contacto,
                    fuente: candidato.fuente,
                    apertura: plantillasRender.apertura || d.mensaje || campana.mensaje_plantilla || '',
                    plantillas: plantillasRender,
                    base_conocimiento: baseConocimiento
                });
            }

            const payload = {
                campana_id: campana.id,
                nombre: campana.nombre,
                analista,
                portal_base_url: portalBaseUrl || undefined,
                intake_path: '/api/atraccion/contacto/intake',
                destinatarios: destinatariosPayload
            };

            try {
                const resp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!resp.ok) {
                    throw new Error(`n8n respondió ${resp.status}`);
                }
            } catch (dispatchError) {
                console.error('[Sourcing] enviar campana n8n:', dispatchError);
                return res.status(502).json({
                    ok: false,
                    error: `No se pudo contactar el flujo de n8n: ${dispatchError.message || dispatchError}`
                });
            }

            const actualizada = await store.setCampanaEstado(campana.id, 'enviando');
            return res.json({
                ok: true,
                dispatched: true,
                enviados: destinatariosPayload.length,
                campana: actualizada
            });
        } catch (error) {
            console.error('[Sourcing] POST enviar campana:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo enviar la campaña' });
        }
    });

    // Lookup para el router de inbound (n8n "Contactación"): ¿este teléfono tiene una preentrevista AT activa?
    app.get('/api/atraccion/contacto/lookup', async (req, res) => {
        const expected = String(process.env.ATCONTACTO_INGEST_KEY || '').trim();
        const got = String(req.headers['x-atcontacto-key'] || '').trim();
        if (!expected || got !== expected) {
            return res.status(401).json({ ok: false, error: 'No autorizado (lookup)' });
        }
        try {
            const telefono = String(req.query.telefono || '').trim();
            const pre = telefono ? await store.getPreentrevistaByTelefono(telefono) : null;
            const ESTADOS_INACTIVOS = new Set(['completada', 'descartada', 'no_disponible']);
            const activa = !!pre && !ESTADOS_INACTIVOS.has(String(pre.estado || ''));
            return res.json({
                ok: true,
                activa,
                preentrevista_id: activa ? pre.id : null,
                estado: pre ? pre.estado : null,
                fase: pre ? pre.fase : null
            });
        } catch (error) {
            console.error('[Sourcing] GET contacto lookup:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar' });
        }
    });

    // Contexto de la preentrevista para el agente (historial + base de conocimiento + fase + datos).
    app.get('/api/atraccion/contacto/context', async (req, res) => {
        const expected = String(process.env.ATCONTACTO_INGEST_KEY || '').trim();
        const got = String(req.headers['x-atcontacto-key'] || '').trim();
        if (!expected || got !== expected) {
            return res.status(401).json({ ok: false, error: 'No autorizado (context)' });
        }
        try {
            const telefono = String(req.query.telefono || '').trim();
            let pre = null;
            if (req.query.preentrevista_id) pre = await store.getPreentrevistaById(String(req.query.preentrevista_id));
            if (!pre && telefono) pre = await store.getPreentrevistaByTelefono(telefono);
            if (!pre) return res.json({ ok: true, encontrada: false });

            const mensajes = await store.getPreentrevistaMensajes(pre.id, { limit: 40 });
            const historial = (mensajes || []).map((m) => ({ rol: m.rol, texto: m.texto }));
            const datos = pre.datos || {};
            const requeridos = (pre.base_conocimiento && pre.base_conocimiento.campos_requeridos) || CAMPOS_FORMULARIO;
            const camposPendientes = requeridos.filter((c) => {
                const v = datos[c];
                return v === undefined || v === null || String(v).trim() === '';
            });

            return res.json({
                ok: true,
                encontrada: true,
                preentrevista_id: pre.id,
                telefono: pre.telefono,
                fase: pre.fase,
                estado: pre.estado,
                interes: pre.interes,
                datos,
                analista: pre.analista || 'Atracción de Talento',
                base_conocimiento: pre.base_conocimiento || {},
                campos_pendientes: camposPendientes,
                historial
            });
        } catch (error) {
            console.error('[Sourcing] GET contacto context:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar el contexto' });
        }
    });

    // Ingest desde n8n: avance de la preentrevista del agente Contacto AT.
    app.post('/api/atraccion/contacto/intake', async (req, res) => {
        const expected = String(process.env.ATCONTACTO_INGEST_KEY || '').trim();
        const got = String(req.headers['x-atcontacto-key'] || '').trim();
        if (!expected || got !== expected) {
            return res.status(401).json({ ok: false, error: 'No autorizado (intake)' });
        }
        const parsed = contactoIntakeSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: formatZodError(parsed.error) });
        }
        try {
            const d = parsed.data;
            let pre = null;
            if (d.preentrevista_id) pre = await store.getPreentrevistaById(d.preentrevista_id);
            if (!pre && d.destinatario_id) {
                pre = await store.createPreentrevista({ destinatarioId: d.destinatario_id });
            }
            if (!pre && d.telefono) pre = await store.getPreentrevistaByTelefono(d.telefono);
            if (!pre) return res.status(404).json({ ok: false, error: 'Preentrevista no encontrada' });

            const turnos = Array.isArray(d.mensajes) && d.mensajes.length
                ? d.mensajes
                : (d.mensaje ? [d.mensaje] : []);
            for (const t of turnos) {
                await store.appendPreentrevistaMensaje({
                    preentrevistaId: pre.id,
                    rol: t.rol,
                    texto: t.texto
                });
            }

            const updated = await store.updatePreentrevista({
                id: pre.id,
                fase: d.fase,
                estado: d.estado,
                interes: d.interes,
                datos: d.datos,
                cvUrl: d.cv_url,
                entrevista: d.entrevista,
                score: d.score,
                resumenMatch: d.resumen_match
            });

            if (d.destinatario_estado && (pre.destinatario_id || d.destinatario_id)) {
                await store.updateDestinatarioEstado({
                    campanaId: pre.campana_id,
                    destinatarioId: pre.destinatario_id || d.destinatario_id,
                    estado: d.destinatario_estado,
                    errorMensaje: null
                });
                if (pre.campana_id) await store.refreshCampanaEstado(pre.campana_id);
            }

            // Sync estructurado: al completar apto, volcar datos recolectados al perfil
            // del candidato para que quede listo para entrevista formal.
            try {
                const scoreMin = Number(process.env.ATRACCION_SCORE_MIN || process.env.SOURCING_SCORE_MIN || 70);
                const score = Number(updated?.score);
                const candidatoId = updated?.candidato_id || pre?.candidato_id;
                if (updated?.estado === 'completada' && candidatoId && Number.isFinite(score) && score >= scoreMin) {
                    const perfilPatch = {
                        preentrevista_datos: updated.datos || {},
                        preentrevista_score: score,
                        preentrevista_resumen: updated.resumen_match || null,
                        preentrevista_cv_url: updated.cv_url || null,
                        preentrevista_entrevista: updated.entrevista || null,
                        preentrevista_apto: true
                    };
                    await store.updateCandidatoPerfil(candidatoId, perfilPatch);
                }
            } catch (syncErr) {
                console.error('[Sourcing] intake sync candidato:', syncErr);
            }

            return res.json({ ok: true, preentrevista: updated });
        } catch (error) {
            console.error('[Sourcing] POST contacto intake:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo procesar el intake' });
        }
    });

    registerSourcingExtendedRoutes({
        app,
        pool,
        store,
        integrations,
        writeGuard,
        readGuard,
        workerGuard: [workerAuthMiddleware],
        resolveActorUserId: async (req) => resolveActorUserIdForSession(pool, req.user || {})
    });

    registerSourcingInternalRoutes({
        app,
        pool,
        integrations,
        runJobScoring: deps.runJobScoring,
        scoreCandidatoFn: deps.scoreCandidatoFn,
        evaluateCandidatoForPersist,
        zohoPushEnabled: String(process.env.SOURCING_PUSH_ZOHO || '').toLowerCase() === 'true',
        zohoClient: createZohoRecruitClient({
            getTokens: () => integrations.getZohoTokens(),
            saveTokens: (t) => integrations.saveZohoTokens(t)
        })
    });
}

module.exports = { registerSourcingRoutes };
