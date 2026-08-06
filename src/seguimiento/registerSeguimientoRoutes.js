const { createSeguimientoSchema } = require('./seguimientoSchema');
const { createSeguimientoService } = require('./seguimientoService');

function parseUuid(value) {
    const s = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
        return null;
    }
    return s;
}

function actorFromReq(req) {
    return {
        userId: parseUuid(req.user?.sub) || parseUuid(req.user?.id) || null,
        email: String(req.user?.email || '').trim().toLowerCase() || null,
        role: String(req.user?.role || '').trim().toLowerCase()
    };
}

function registerSeguimientoRoutes({
    app,
    pool,
    verificarToken,
    allowRoles,
    adminActionLimiter,
    catalogLimiter,
    emailNotificationsPublisher,
    listEmailsInGroups,
    listAssignedClientesForGpUserId,
    resolveGpInternalUserIdForScope
}) {
    const schema = createSeguimientoSchema({ pool });
    const service = createSeguimientoService({
        pool,
        emailNotificationsPublisher,
        listEmailsInGroups
    });

    let ready = false;
    async function ensureReady() {
        if (ready) return;
        await schema.ensureSeguimientoTables();
        ready = true;
    }

    const staffRoles = allowRoles(['gp', 'cac', 'super_admin']);
    const limiter = catalogLimiter || ((req, res, next) => next());
    const writeLimiter = adminActionLimiter || limiter;

    async function gpScopeUserId(req) {
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'gp') return null;
        if (typeof resolveGpInternalUserIdForScope === 'function') {
            const gpEmail = String(req.user?.email || '')
                .trim()
                .toLowerCase();
            const gpUserId = parseUuid(req.user?.sub);
            return resolveGpInternalUserIdForScope({ gpEmail, gpUserId });
        }
        return parseUuid(req.user?.sub);
    }

    app.get('/api/seguimiento/actas', verificarToken, staffRoles, limiter, async (req, res) => {
        try {
            await ensureReady();
            const gpUserId = await gpScopeUserId(req);
            const proximosVencer =
                String(req.query.proximosVencer || '').toLowerCase() === 'true' ||
                String(req.query.proximosVencer || '') === '1';
            const items = await service.listActas({
                gpUserId,
                tipo: req.query.tipo || null,
                estado: req.query.estado || null,
                cliente: req.query.cliente || null,
                proximosVencer,
                maxDias: Number(req.query.maxDias || 5)
            });
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('[seguimiento] list actas', e);
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
        }
    });

    app.get('/api/seguimiento/actas/:id', verificarToken, staffRoles, limiter, async (req, res) => {
        try {
            await ensureReady();
            const acta = await service.getActaById(req.params.id);
            if (!acta) return res.status(404).json({ ok: false, error: 'No encontrada' });
            const role = String(req.user?.role || '').toLowerCase();
            if (role === 'gp') {
                const gpUserId = await gpScopeUserId(req);
                if (String(acta.gpUserId || '') !== String(gpUserId || '')) {
                    return res.status(403).json({ ok: false, error: 'Fuera de alcance' });
                }
            }
            return res.json({ ok: true, item: acta });
        } catch (e) {
            console.error('[seguimiento] get acta', e);
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
        }
    });

    app.post('/api/seguimiento/actas', verificarToken, staffRoles, writeLimiter, async (req, res) => {
        try {
            await ensureReady();
            const actor = actorFromReq(req);
            if (actor.role === 'gp' && !actor.userId) {
                const resolved = await gpScopeUserId(req);
                actor.userId = resolved;
            }
            const result = await service.createOrUpdateActa(req.body || {}, actor);
            return res.status(201).json({ ok: true, ...result });
        } catch (e) {
            console.error('[seguimiento] create acta', e);
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
        }
    });

    app.patch('/api/seguimiento/actas/:id', verificarToken, staffRoles, writeLimiter, async (req, res) => {
        try {
            await ensureReady();
            const actor = actorFromReq(req);
            if (actor.role === 'gp' && !actor.userId) {
                actor.userId = await gpScopeUserId(req);
            }
            const result = await service.createOrUpdateActa({ ...(req.body || {}), id: req.params.id }, actor);
            return res.json({ ok: true, ...result });
        } catch (e) {
            console.error('[seguimiento] patch acta', e);
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
        }
    });

    app.post(
        '/api/seguimiento/actas/:id/reintentar-correo',
        verificarToken,
        staffRoles,
        writeLimiter,
        async (req, res) => {
            try {
                await ensureReady();
                const actor = actorFromReq(req);
                if (actor.role === 'gp' && !actor.userId) {
                    actor.userId = await gpScopeUserId(req);
                }
                const result = await service.reintentarCorreo(req.params.id, actor);
                return res.json({ ok: true, ...result });
            } catch (e) {
                console.error('[seguimiento] reintentar correo', e);
                return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
            }
        }
    );

    app.delete('/api/seguimiento/actas/:id', verificarToken, allowRoles(['cac', 'super_admin']), writeLimiter, async (req, res) => {
        try {
            await ensureReady();
            const result = await service.softDeleteActa(req.params.id, actorFromReq(req));
            return res.json(result);
        } catch (e) {
            console.error('[seguimiento] delete acta', e);
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
        }
    });

    /** Interno/ops: listar elegibles T5/T1 (protegido por staff SA/CAC). */
    app.get(
        '/api/seguimiento/internal/elegibles-recordatorio',
        verificarToken,
        allowRoles(['cac', 'super_admin']),
        limiter,
        async (req, res) => {
            try {
                await ensureReady();
                const kind = String(req.query.kind || '').toUpperCase();
                const items = await service.listElegiblesRecordatorio({
                    kind,
                    asOfDate: req.query.asOfDate || undefined
                });
                return res.json({ ok: true, items });
            } catch (e) {
                return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
            }
        }
    );

    app.post(
        '/api/seguimiento/internal/process-reminder',
        verificarToken,
        allowRoles(['cac', 'super_admin']),
        writeLimiter,
        async (req, res) => {
            try {
                await ensureReady();
                const result = await service.processReminderMessage({
                    seguimientoId: req.body?.seguimientoId,
                    kind: req.body?.kind
                });
                return res.json({ ok: true, result });
            } catch (e) {
                return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Error' });
            }
        }
    );

    return { ensureReady, service };
}

module.exports = { registerSeguimientoRoutes };
