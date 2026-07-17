/**
 * Rutas del m?dulo Conciliaciones.
 * Acceso: panel `conciliaciones` o paneles admin de novedades (`userHasConciliacionesAccess` en front).
 */

const NOVEDADES_ADMIN_PANELS = ['dashboard', 'calendar', 'gestion', 'admin'];
const CONCILIACIONES_ACCESS_PANELS = ['conciliaciones', ...NOVEDADES_ADMIN_PANELS];

const {
    isWideConciliacionRole,
    mergeConciliacionClientesLists,
    parseNovedadesImpactOptions
} = require('./conciliacionesQueries');

function buildRevisionActorFromReq(req) {
    const user = req.user || {};
    return {
        id: user.sub || user.id || null,
        email: user.email || '',
        full_name: user.full_name || user.name || '',
        role: req.scope?.role || user.role || ''
    };
}

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
        'applyConciliacionFacturacionRevisionForScope',
        'applyConciliacionFacturacionRevisionMasivaForScope',
        'applyConciliacionFacturacionAjustesForScope',
        'createConciliacionNovedadManualForScope',
        'listConciliacionFacturacionHistorialForScope',
        'upsertConciliacionFacturacionMasivaForScope',
        'deleteConciliacionFacturacionForScope',
        'listConciliacionesFacturacionForScope',
        'getColaCierresPorMesForScope',
        'listServiciosForScope',
        'createServicioForScope',
        'updateServicioForScope',
        'deleteServicioForScope',
        'listServicioConsultoresForScope',
        'listConsultoresDisponiblesClienteForScope',
        'upsertServicioConsultoresForScope',
        'listDashboardLiderClienteRowsForScope',
        'exportConciliacionServicioExcelForScope',
        'markConciliacionServicioEnviadaForScope',
        'markConciliacionServicioConciliadaForScope',
        'enviarConciliacionServicioCorreoForScope',
        'getConciliacionEmailAccionContext',
        'decideConciliacionEmailAccion',
        'decideMasivoConciliacionEmailAccion',
        'finalizeConciliacionEmailAccion',
        'getConciliacionEmailPlantillaCorreoLiderForScope',
        'upsertConciliacionEmailPlantillaCorreoLiderForScope'
    ];
    for (const key of required) {
        if (deps == null || deps[key] == null) {
            throw new Error(`registerConciliacionesRoutes: falta dependencia "${key}"`);
        }
        if (key !== 'app' && typeof deps[key] !== 'function') {
            throw new Error(`registerConciliacionesRoutes: "${key}" debe ser funci?n (recibido ${typeof deps[key]})`);
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
        applyConciliacionFacturacionRevisionForScope,
        applyConciliacionFacturacionRevisionMasivaForScope,
        applyConciliacionFacturacionAjustesForScope,
        createConciliacionNovedadManualForScope,
        listConciliacionFacturacionHistorialForScope,
        upsertConciliacionFacturacionMasivaForScope,
        deleteConciliacionFacturacionForScope,
        listConciliacionesFacturacionForScope,
        getColaCierresPorMesForScope,
        listServiciosForScope,
        createServicioForScope,
        updateServicioForScope,
        deleteServicioForScope,
        listServicioConsultoresForScope,
        listConsultoresDisponiblesClienteForScope,
        upsertServicioConsultoresForScope,
        listDashboardLiderClienteRowsForScope,
        exportConciliacionServicioExcelForScope,
        markConciliacionServicioEnviadaForScope,
        markConciliacionServicioConciliadaForScope,
        enviarConciliacionServicioCorreoForScope,
        getConciliacionEmailPlantillaCorreoLiderForScope,
        upsertConciliacionEmailPlantillaCorreoLiderForScope
    } = deps;

    const guardChain = [verificarToken, allowAnyPanel(CONCILIACIONES_ACCESS_PANELS), applyScope];

    app.get('/api/conciliaciones/clientes', ...guardChain, async (req, res) => {
        try {
            const clientesPg = await listConciliacionesClientesForScope(req.scope);
            let clientes = clientesPg;
            if (isWideConciliacionRole(req.scope?.role)) {
                const servicios = await listServiciosForScope(req.scope);
                const fromDynamo = (servicios || [])
                    .map((s) => String(s?.client || '').trim())
                    .filter(Boolean);
                if (fromDynamo.length) {
                    clientes = mergeConciliacionClientesLists(clientesPg, fromDynamo);
                }
            }
            return res.json({ ok: true, clientes });
        } catch (e) {
            console.error('[conciliaciones/clientes]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar clientes' });
        }
    });

    app.get('/api/conciliaciones/dashboard-resumen', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
        try {
            const out = await getConciliacionesDashboardResumenForScope(req.scope, ym.year, ym.month);
            if (!out.ok) return res.status(500).json({ ok: false, error: 'Error' });
            return res.json({
                ok: true,
                year: ym.year,
                month: ym.month,
                clientesCount: out.clientesCount,
                serviciosCount: out.serviciosCount,
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
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
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
            const impactOpts = parseNovedadesImpactOptions(req.query);
            const servicioId = String(req.query.servicioId || '').trim();
            if (servicioId) {
                const servicios = await listServiciosForScope(req.scope);
                const svc = (servicios || []).find((s) => String(s.id) === servicioId);
                if (svc?.consultoresCedulas?.length) {
                    impactOpts.servicioCedulas = svc.consultoresCedulas;
                }
            }
            const out = await getConciliacionResumenPorClienteMesForScope(
                req.scope,
                cliente,
                ym.year,
                ym.month,
                impactOpts
            );
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
        if (!cliente) return res.status(400).json({ ok: false, error: 'Par?metro cliente requerido' });
        if (!cedula) return res.status(400).json({ ok: false, error: 'Par?metro cedula requerido' });
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
        try {
            const impactOpts = parseNovedadesImpactOptions(req.query);
            const out = await listConciliacionNovedadesDetalleForScope(
                req.scope,
                cliente,
                cedula,
                ym.year,
                ym.month,
                impactOpts
            );
            if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Error' });
            return res.json({
                ok: true,
                clienteCanon: out.clienteCanon,
                items: out.items,
                billingMode: out.billingMode ?? null,
                baseHours: out.baseHours ?? null,
                horasBaseMes: out.horasBaseMes ?? null,
                tarifaValorHora: out.tarifaValorHora ?? null,
                tarifaCliente: out.tarifaCliente,
                tarifaMaestro: out.tarifaMaestro,
                tarifaAjustada: out.tarifaAjustada,
                facturaCop: out.facturaCop,
                diasBaseMes: out.diasBaseMes ?? null,
                diasBaseLabel: out.diasBaseLabel ?? null,
                festivosAplicados: out.festivosAplicados ?? false
            });
        } catch (e) {
            console.error('[conciliaciones/novedades-detalle]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar detalle' });
        }
    });

    app.post('/api/conciliaciones/facturacion/revision', ...guardChain, async (req, res) => {
        const { facturacionRevisionSchema } = require('./schemas/facturacion');
        const parseResult = facturacionRevisionSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await applyConciliacionFacturacionRevisionForScope(
                req.scope,
                parseResult.data,
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/revision POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al registrar revisi?n' });
        }
    });

    app.post('/api/conciliaciones/facturacion/revision/masiva', ...guardChain, async (req, res) => {
        const { facturacionRevisionMasivaSchema } = require('./schemas/facturacion');
        const parseResult = facturacionRevisionMasivaSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await applyConciliacionFacturacionRevisionMasivaForScope(
                req.scope,
                parseResult.data,
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/revision/masiva POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al procesar revisi?n masiva' });
        }
    });

    app.post('/api/conciliaciones/facturacion/ajustes', ...guardChain, async (req, res) => {
        const { facturacionAjustesSchema } = require('./schemas/facturacion');
        const parseResult = facturacionAjustesSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await applyConciliacionFacturacionAjustesForScope(
                req.scope,
                parseResult.data,
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/ajustes POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al guardar ajustes' });
        }
    });

    app.post('/api/conciliaciones/novedades-manuales', ...guardChain, async (req, res) => {
        const { conciliacionNovedadManualSchema } = require('./schemas/facturacion');
        const parseResult = conciliacionNovedadManualSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await createConciliacionNovedadManualForScope(
                req.scope,
                parseResult.data,
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, novedadId: out.novedadId, item: out.item });
        } catch (e) {
            console.error('[conciliaciones/novedades-manuales POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al registrar novedad manual' });
        }
    });

    app.get('/api/conciliaciones/facturacion/historial', ...guardChain, async (req, res) => {
        const { facturacionHistorialQuerySchema } = require('./schemas/facturacion');
        const parseResult = facturacionHistorialQuerySchema.safeParse({
            cedula: req.query.cedula,
            anio: req.query.anio ?? req.query.year,
            mes: req.query.mes ?? req.query.month
        });
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Par?metros inv?lidos',
                errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const items = await listConciliacionFacturacionHistorialForScope(req.scope, parseResult.data);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('[conciliaciones/facturacion/historial GET]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al cargar historial' });
        }
    });

    app.post('/api/conciliaciones/facturacion', ...guardChain, async (req, res) => {
        const { upsertFacturacionSchema } = require('./schemas/facturacion');
        const parseResult = upsertFacturacionSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await upsertConciliacionFacturacionForScope(req.scope, parseResult.data);
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al guardar facturaci?n' });
        }
    });

    app.post('/api/conciliaciones/facturacion/masiva', ...guardChain, async (req, res) => {
        const { upsertFacturacionMasivaSchema } = require('./schemas/facturacion');
        const parseResult = upsertFacturacionMasivaSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await upsertConciliacionFacturacionMasivaForScope(req.scope, parseResult.data);
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/masiva POST]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al procesar acci?n masiva' });
        }
    });

    app.delete('/api/conciliaciones/facturacion', ...guardChain, async (req, res) => {
        const { deleteFacturacionSchema } = require('./schemas/facturacion');
        const parseResult = deleteFacturacionSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ok: false,
                error: 'Datos de entrada inv?lidos',
                errors: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        try {
            const out = await deleteConciliacionFacturacionForScope(
                req.scope,
                parseResult.data,
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion DELETE]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al revertir cierre' });
        }
    });

    app.get('/api/conciliaciones/facturacion/dashboard-lider-cliente', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
        try {
            const items = await listDashboardLiderClienteRowsForScope(req.scope, ym.year, ym.month);
            return res.json({ ok: true, year: ym.year, month: ym.month, items });
        } catch (e) {
            console.error('[conciliaciones/facturacion/dashboard-lider-cliente]', e);
            return res.status(500).json({ ok: false, error: 'Error al cargar datos l?der ? cliente' });
        }
    });

    app.get('/api/conciliaciones/facturacion/export-excel', ...guardChain, async (req, res) => {
        const servicioId = String(req.query.servicioId || '').trim();
        const ym = parseYearMonth(req.query);
        if (!servicioId) return res.status(400).json({ ok: false, error: 'servicioId requerido' });
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
        try {
            const { workbook, filename, servicioId: sid, year, month } = await exportConciliacionServicioExcelForScope(req.scope, {
                servicioId,
                year: ym.year,
                month: ym.month
            });
            await markConciliacionServicioEnviadaForScope(
                req.scope,
                { servicioId: sid, year, month },
                buildRevisionActorFromReq(req)
            );
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            await workbook.xlsx.write(res);
            res.end();
        } catch (e) {
            console.error('[conciliaciones/facturacion/export-excel]', e);
            const status = e.status || 500;
            if (!res.headersSent) {
                return res.status(status).json({ ok: false, error: e.message || 'Error al exportar Excel' });
            }
        }
    });

    app.post('/api/conciliaciones/facturacion/servicio-cierre/conciliar', ...guardChain, async (req, res) => {
        const servicioId = String(req.body?.servicioId || '').trim();
        const anio = Number(req.body?.anio ?? req.body?.year);
        const mes = Number(req.body?.mes ?? req.body?.month);
        if (!servicioId) return res.status(400).json({ ok: false, error: 'servicioId requerido' });
        if (!Number.isFinite(anio) || !Number.isFinite(mes)) {
            return res.status(400).json({ ok: false, error: 'anio y mes v?lidos requeridos' });
        }
        try {
            const out = await markConciliacionServicioConciliadaForScope(
                req.scope,
                { servicioId, anio, mes },
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, ...out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/servicio-cierre/conciliar]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al marcar conciliada' });
        }
    });

    app.get('/api/conciliaciones/email-plantilla/correo-lider', ...guardChain, async (req, res) => {
        try {
            const plantilla = await getConciliacionEmailPlantillaCorreoLiderForScope(req.scope);
            return res.json({ ok: true, plantilla });
        } catch (e) {
            console.error('[conciliaciones/email-plantilla/correo-lider GET]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al cargar plantilla' });
        }
    });

    app.put('/api/conciliaciones/email-plantilla/correo-lider', ...guardChain, async (req, res) => {
        try {
            const plantilla = await upsertConciliacionEmailPlantillaCorreoLiderForScope(
                req.scope,
                req.body || {},
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, plantilla });
        } catch (e) {
            console.error('[conciliaciones/email-plantilla/correo-lider PUT]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al guardar plantilla' });
        }
    });

    app.post('/api/conciliaciones/facturacion/servicio-cierre/enviar-correo', ...guardChain, async (req, res) => {
        const servicioId = String(req.body?.servicioId || '').trim();
        const anio = Number(req.body?.anio ?? req.body?.year);
        const mes = Number(req.body?.mes ?? req.body?.month);
        if (!servicioId) return res.status(400).json({ ok: false, error: 'servicioId requerido' });
        if (!Number.isFinite(anio) || !Number.isFinite(mes)) {
            return res.status(400).json({ ok: false, error: 'anio y mes v?lidos requeridos' });
        }
        try {
            const out = await enviarConciliacionServicioCorreoForScope(
                req.scope,
                req.body || {},
                buildRevisionActorFromReq(req)
            );
            return res.json({ ok: true, data: out });
        } catch (e) {
            console.error('[conciliaciones/facturacion/servicio-cierre/enviar-correo]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al enviar correo' });
        }
    });

    app.get('/api/conciliaciones/facturacion/cola-cierres', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
        const cliente = String(req.query.cliente || '').trim();
        try {
            const out = await getColaCierresPorMesForScope(req.scope, ym.year, ym.month, cliente || undefined);
            if (!out.ok) return res.status(500).json({ ok: false, error: 'Error al armar cola de cierres' });
            return res.json({
                ok: true,
                year: ym.year,
                month: ym.month,
                count: out.count,
                items: out.items
            });
        } catch (e) {
            console.error('[conciliaciones/facturacion/cola-cierres]', e);
            const detail = process.env.NODE_ENV !== 'production' && e?.message ? `: ${e.message}` : '';
            return res.status(500).json({ ok: false, error: `Error al armar cola de cierres${detail}` });
        }
    });

    app.get('/api/conciliaciones/facturacion', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month v?lidos requeridos (1-12)' });
        try {
            const items = await listConciliacionesFacturacionForScope(req.scope, ym.year, ym.month);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('[conciliaciones/facturacion GET]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar facturaci?n' });
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
            // Validaci?n m?nima
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

    app.get('/api/conciliaciones/servicios/consultores-disponibles', ...guardChain, async (req, res) => {
        const cliente = String(req.query.cliente || '').trim();
        if (!cliente) return res.status(400).json({ ok: false, error: 'cliente requerido' });
        try {
            const options = {};
            if (Object.prototype.hasOwnProperty.call(req.query, 'lideres')) {
                const raw = String(req.query.lideres ?? '');
                options.lideresAsociados = raw.trim()
                    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
                    : [];
            }
            const excludeServicioId = String(req.query.excludeServicioId || '').trim();
            if (excludeServicioId) options.excludeServicioId = excludeServicioId;
            const items = await listConsultoresDisponiblesClienteForScope(req.scope, cliente, options);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('[conciliaciones/servicios/consultores-disponibles GET]', e);
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al listar consultores disponibles' });
        }
    });

    app.get('/api/conciliaciones/servicios/:idServicio/consultores', ...guardChain, async (req, res) => {
        const idServicio = req.params.idServicio;
        if (!idServicio) return res.status(400).json({ ok: false, error: 'idServicio requerido' });
        try {
            const lider = String(req.query.lider || '').trim() || undefined;
            const options = { lider };
            if (Object.prototype.hasOwnProperty.call(req.query, 'lideres')) {
                const raw = String(req.query.lideres ?? '');
                options.lideresAsociados = raw.trim()
                    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
                    : [];
            }
            const items = await listServicioConsultoresForScope(req.scope, idServicio, options);
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

    const {
        getConciliacionEmailAccionContext,
        decideConciliacionEmailAccion,
        decideMasivoConciliacionEmailAccion,
        finalizeConciliacionEmailAccion
    } = deps;
    const emailAccionLimiter =
        typeof deps.emailAccionLimiter === 'function' ? deps.emailAccionLimiter : (_req, _res, next) => next();

    app.get('/api/conciliaciones/email-accion/context', emailAccionLimiter, async (req, res) => {
        const token = String(req.query.token || '').trim();
        if (!token) {
            return res.status(400).json({ ok: false, error: 'Token requerido' });
        }
        try {
            const ctx = await getConciliacionEmailAccionContext(token);
            return res.json({ ok: true, ...ctx });
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'Enlace no válido' });
        }
    });

    app.post('/api/conciliaciones/email-accion/decide', emailAccionLimiter, async (req, res) => {
        const token = String(req.body?.token || '').trim();
        if (!token) {
            return res.status(400).json({ ok: false, error: 'Token requerido' });
        }
        try {
            const out = await decideConciliacionEmailAccion(token, {
                cedula: req.body?.cedula,
                decision: req.body?.decision,
                observacion: req.body?.observacion
            });
            return res.json({ ok: true, ...out });
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'No se pudo registrar la decisión' });
        }
    });

    app.post('/api/conciliaciones/email-accion/decide-masivo', emailAccionLimiter, async (req, res) => {
        const token = String(req.body?.token || '').trim();
        if (!token) {
            return res.status(400).json({ ok: false, error: 'Token requerido' });
        }
        try {
            const out = await decideMasivoConciliacionEmailAccion(token, {
                decision: req.body?.decision,
                observacion: req.body?.observacion,
                cedulas: req.body?.cedulas
            });
            return res.json({ ok: true, ...out });
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'No se pudo registrar la decisión masiva' });
        }
    });

    app.post('/api/conciliaciones/email-accion/finalize', emailAccionLimiter, async (req, res) => {
        const token = String(req.body?.token || '').trim();
        if (!token) {
            return res.status(400).json({ ok: false, error: 'Token requerido' });
        }
        try {
            const out = await finalizeConciliacionEmailAccion(token);
            return res.json({ ok: true, ...out });
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message || 'No se pudo finalizar' });
        }
    });
}

module.exports = {
    registerConciliacionesRoutes,
    assertConciliacionesRouteDeps,
    NOVEDADES_ADMIN_PANELS,
    CONCILIACIONES_ACCESS_PANELS
};
