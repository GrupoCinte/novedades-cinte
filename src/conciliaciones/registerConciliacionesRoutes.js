/**
 * Rutas GET del módulo Conciliaciones (solo lectura v1).
 * Mismo alcance de paneles que Novedades admin en front (`userHasNovedadesAdminAccess`).
 */

const NOVEDADES_ADMIN_PANELS = ['dashboard', 'calendar', 'gestion', 'admin'];

function parseYearMonth(q) {
    const year = Number(q.year);
    const month = Number(q.month);
    if (!Number.isFinite(year) || year < 1970 || year > 2100) return null;
    if (!Number.isFinite(month) || month < 1 || month > 12) return null;
    return { year, month };
}

/** Falla al arrancar el servidor si falta cableado desde createDataLayer (evita HTTP 500 opacos). */
function assertConciliacionesRouteDeps(deps) {
    const required = [
        'app',
        'verificarToken',
        'allowAnyPanel',
        'applyScope',
        'listConciliacionesClientesForScope',
        'getConciliacionResumenPorClienteMesForScope',
        'getConciliacionResumenTodosClientesMesForScope',
        'listConciliacionNovedadesDetalleForScope',
        'getConciliacionesDashboardResumenForScope',
        'upsertConciliacionFacturacionForScope',
        'upsertConciliacionFacturacionMasivaForScope',
        'listConciliacionesFacturacionForScope',
        'listServiciosForScope',
        'createServicioForScope',
        'updateServicioForScope',
        'deleteServicioForScope',
        'listServicioConsultoresForScope',
        'upsertServicioConsultoresForScope'
    ];
    for (const key of required) {
        if (deps == null || deps[key] == null) {
            throw new Error(`registerConciliacionesRoutes: falta dependencia "${key}"`);
        }
        if (key !== 'app' && typeof deps[key] !== 'function') {
            throw new Error(`registerConciliacionesRoutes: "${key}" debe ser función (recibido ${typeof deps[key]})`);
        }
    }
}

function registerConciliacionesRoutes(deps) {
    assertConciliacionesRouteDeps(deps);
    const {
        app,
        verificarToken,
        allowAnyPanel,
        applyScope,
        listConciliacionesClientesForScope,
        getConciliacionResumenPorClienteMesForScope,
        getConciliacionResumenTodosClientesMesForScope,
        listConciliacionNovedadesDetalleForScope,
        getConciliacionesDashboardResumenForScope,
        upsertConciliacionFacturacionForScope,
        upsertConciliacionFacturacionMasivaForScope,
        listConciliacionesFacturacionForScope,
        listServiciosForScope,
        createServicioForScope,
        updateServicioForScope,
        deleteServicioForScope,
        listServicioConsultoresForScope,
        upsertServicioConsultoresForScope
    } = deps;

    const guardChain = [verificarToken, allowAnyPanel(NOVEDADES_ADMIN_PANELS), applyScope];

    app.get('/api/conciliaciones/clientes', ...guardChain, async (req, res) => {
        try {
            const clientes = await listConciliacionesClientesForScope(req.scope);
            return res.json({ ok: true, clientes });
        } catch (e) {
            console.error('[conciliaciones/clientes]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar clientes' });
        }
    });

    app.get('/api/conciliaciones/dashboard-resumen', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            const out = await getConciliacionesDashboardResumenForScope(req.scope, ym.year, ym.month);
            if (!out.ok) return res.status(500).json({ ok: false, error: 'Error' });
            return res.json({
                ok: true,
                year: ym.year,
                month: ym.month,
                clientesCount: out.clientesCount,
                globalTotales: out.globalTotales,
                rows: out.rows
            });
        } catch (e) {
            console.error('[conciliaciones/dashboard-resumen]', e);
            return res.status(500).json({ ok: false, error: 'Error al armar dashboard' });
        }
    });

    app.get('/api/conciliaciones/por-cliente', ...guardChain, async (req, res) => {
        const cliente = String(req.query.cliente || '').trim();
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            if (!cliente) {
                const out = await getConciliacionResumenTodosClientesMesForScope(req.scope, ym.year, ym.month);
                if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Error' });
                return res.json({
                    ok: true,
                    allClients: true,
                    year: ym.year,
                    month: ym.month,
                    rows: out.rows,
                    totales: out.totales,
                    clientesCount: out.clientesCount
                });
            }
            const out = await getConciliacionResumenPorClienteMesForScope(req.scope, cliente, ym.year, ym.month);
            if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Error' });
            return res.json({
                ok: true,
                clienteCanon: out.clienteCanon,
                year: ym.year,
                month: ym.month,
                rows: out.rows,
                totales: out.totales
            });
        } catch (e) {
            console.error('[conciliaciones/por-cliente]', e);
            return res.status(500).json({ ok: false, error: 'Error al armar resumen' });
        }
    });

    app.get('/api/conciliaciones/novedades-detalle', ...guardChain, async (req, res) => {
        const cliente = String(req.query.cliente || '').trim();
        const cedula = String(req.query.cedula || '').trim();
        const ym = parseYearMonth(req.query);
        if (!cliente) return res.status(400).json({ ok: false, error: 'Parámetro cliente requerido' });
        if (!cedula) return res.status(400).json({ ok: false, error: 'Parámetro cedula requerido' });
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            const out = await listConciliacionNovedadesDetalleForScope(req.scope, cliente, cedula, ym.year, ym.month);
            if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Error' });
            return res.json({ ok: true, clienteCanon: out.clienteCanon, items: out.items });
        } catch (e) {
            console.error('[conciliaciones/novedades-detalle]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar detalle' });
        }
    });

    app.post('/api/conciliaciones/facturacion', ...guardChain, async (req, res) => {
        const { upsertFacturacionSchema } = require('./schemas/facturacion');
        const parseResult = upsertFacturacionSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inválidos',
                errors: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await upsertConciliacionFacturacionForScope(req.scope, parseResult.data);
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al guardar facturación' });
        }
    });

    app.post('/api/conciliaciones/facturacion/masiva', ...guardChain, async (req, res) => {
        const { upsertFacturacionMasivaSchema } = require('./schemas/facturacion');
        const parseResult = upsertFacturacionMasivaSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inválidos',
                errors: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await upsertConciliacionFacturacionMasivaForScope(req.scope, parseResult.data);
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/masiva POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al procesar acción masiva' });
        }
    });

    app.get('/api/conciliaciones/facturacion', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            const items = await listConciliacionesFacturacionForScope(req.scope, ym.year, ym.month);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('[conciliaciones/facturacion GET]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar facturación' });
        }
    });

    app.get('/api/conciliaciones/servicios', ...guardChain, async (req, res) => {
        try {
            const items = await listServiciosForScope(req.scope);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('[conciliaciones/servicios GET]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar servicios' });
        }
    });

    app.post('/api/conciliaciones/servicios', ...guardChain, async (req, res) => {
        try {
            // Validación mínima
            const payload = req.body || {};
            console.log('[DEBUG] POST /api/conciliaciones/servicios payload:', payload);
            if (!payload.client || !payload.serviceName) {
                return res.status(400).json({ ok: false, error: 'Faltan campos requeridos (client, serviceName)' });
            }
            const out = await createServicioForScope(req.scope, payload);
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/servicios POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al crear servicio' });
        }
    });

    app.put('/api/conciliaciones/servicios/:idServicio', ...guardChain, async (req, res) => {
        const idServicio = req.params.idServicio;
        if (!idServicio) return res.status(400).json({ ok: false, error: 'idServicio requerido' });
        try {
            const payload = req.body || {};
            if (!payload.client || !payload.serviceName) {
                return res.status(400).json({ ok: false, error: 'Faltan campos requeridos (client, serviceName)' });
            }
            const out = await updateServicioForScope(req.scope, idServicio, payload);
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error(`[conciliaciones/servicios/${idServicio} PUT]`, e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al actualizar servicio' });
        }
    });

    app.delete('/api/conciliaciones/servicios/:idServicio', ...guardChain, async (req, res) => {
        const idServicio = req.params.idServicio;
        if (!idServicio) return res.status(400).json({ ok: false, error: 'idServicio requerido' });
        try {
            await deleteServicioForScope(req.scope, idServicio);
            return res.json({ ok: true });
        } catch (e) {
            console.error(`[conciliaciones/servicios/${idServicio} DELETE]`, e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al eliminar servicio' });
        }
    });

    app.get('/api/conciliaciones/servicios/:idServicio/consultores', ...guardChain, async (req, res) => {
        const idServicio = req.params.idServicio;
        if (!idServicio) return res.status(400).json({ ok: false, error: 'idServicio requerido' });
        try {
            const items = await listServicioConsultoresForScope(req.scope, idServicio);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error(`[conciliaciones/servicios/${idServicio}/consultores GET]`, e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al listar consultores del servicio' });
        }
    });

    app.post('/api/conciliaciones/servicios/:idServicio/consultores', ...guardChain, async (req, res) => {
        const idServicio = req.params.idServicio;
        const cedulas = req.body.cedulas;
        if (!idServicio) return res.status(400).json({ ok: false, error: 'idServicio requerido' });
        if (!Array.isArray(cedulas)) return res.status(400).json({ ok: false, error: 'cedulas debe ser un array' });
        try {
            await upsertServicioConsultoresForScope(req.scope, idServicio, cedulas);
            return res.json({ ok: true });
        } catch (e) {
            console.error(`[conciliaciones/servicios/${idServicio}/consultores POST]`, e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al asociar consultores al servicio' });
        }
    });
}

module.exports = { registerConciliacionesRoutes, assertConciliacionesRouteDeps, NOVEDADES_ADMIN_PANELS };
